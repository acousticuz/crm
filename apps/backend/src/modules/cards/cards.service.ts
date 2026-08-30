import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { ClsService } from "nestjs-cls";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { StageType, SOCKET_EVENTS } from "@acoustic-crm/shared";
import { readContext } from "../../common/tenant-context";
import { normalizePhone } from "../../common/phone";
import { PrismaService } from "../prisma/prisma.service";
import { RealtimeService } from "../realtime/realtime.service";
import { EVT, type CardCreatedEvent, type CardMovedEvent } from "../triggers/events";
import { CreateCardDto, FindCardsDto, MoveCardDto, UpdateCardDto } from "./dto/card.dto";

const DEFAULT_PAGE_SIZE = 50;

@Injectable()
export class CardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly cls: ClsService,
    private readonly events: EventEmitter2,
  ) {}

  private currentTenantId(): string {
    const tid = readContext(this.cls).tenantId;
    if (!tid) throw new UnauthorizedException("No tenant context");
    return tid;
  }

  async create(dto: CreateCardDto) {
    const tenantId = this.currentTenantId();
    // Verify contact exists in tenant.
    const contact = await this.prisma.t.contact.findFirst({
      where: { id: dto.contactId, deletedAt: null },
    });
    if (!contact) throw new BadRequestException("Contact not found in this tenant");

    // Resolve pipeline + stage. If not supplied, use tenant defaults.
    const pipeline = dto.pipelineId
      ? await this.prisma.t.pipeline.findFirst({
          where: { id: dto.pipelineId, deletedAt: null },
        })
      : await this.prisma.t.pipeline.findFirst({
          where: { isDefault: true, deletedAt: null },
        });
    if (!pipeline) throw new BadRequestException("No pipeline available");

    const stage = dto.stageId
      ? await this.prisma.t.stage.findFirst({
          where: { id: dto.stageId, pipelineId: pipeline.id, deletedAt: null },
        })
      : await this.prisma.t.stage.findFirst({
          where: { pipelineId: pipeline.id, type: StageType.NORMAL, deletedAt: null },
          orderBy: { order: "asc" },
        });
    if (!stage) throw new BadRequestException("No stage available in the pipeline");

    const card = await this.prisma.t.card.create({
      data: {
        tenantId,
        pipelineId: pipeline.id,
        stageId: stage.id,
        contactId: contact.id,
        title: dto.title,
        responsibleUserId: dto.responsibleUserId ?? null,
        branchId: dto.branchId ?? null,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        budget: dto.budget !== undefined ? new Prisma.Decimal(dto.budget) : null,
        enteredStageAt: new Date(),
        status: stage.type === StageType.WON ? "WON" : stage.type === StageType.LOST ? "LOST" : "OPEN",
      },
    });
    this.realtime.toTenant(tenantId, SOCKET_EVENTS.CARD_CREATED, { card });
    const evt: CardCreatedEvent = {
      tenantId,
      at: new Date(),
      cardId: card.id,
      pipelineId: card.pipelineId,
      stageId: card.stageId,
      contactId: card.contactId,
      source: contact.source,
    };
    this.events.emit(EVT.CARD_CREATED, evt);
    return card;
  }

  async list(query: FindCardsDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const where: Prisma.CardWhereInput = { deletedAt: null };
    if (query.pipelineId) where.pipelineId = query.pipelineId;
    if (query.stageId) where.stageId = query.stageId;
    if (query.responsibleUserId) where.responsibleUserId = query.responsibleUserId;
    // Two filter shapes: single branchId (legacy / single-select) OR
    // branchIds array (multi-select from the new Kanban filter bar). Array
    // wins when both are present so multi-select takes precedence.
    //
    // Match semantics: a card belongs to the branch filter when EITHER
    // (a) Card.branchId itself matches — the lead is owned by that branch,
    // OR (b) any of the card's calls is tagged with that branch — the
    // customer asked about that branch on a call. Without (b), operators who
    // attach a branch via the per-call dropdown saw their cards disappear
    // from the filter, since Card.branchId was still null.
    const selectedBranchIds =
      query.branchIds && query.branchIds.length > 0
        ? query.branchIds
        : query.branchId
          ? [query.branchId]
          : null;
    if (selectedBranchIds) {
      where.OR = [
        { branchId: { in: selectedBranchIds } },
        { calls: { some: { branchId: { in: selectedBranchIds }, deletedAt: null } } },
      ];
    }
    if (query.tagId) where.cardTags = { some: { tagId: query.tagId } };
    if (query.source) where.contact = { source: query.source };
    // "Missed only" — cards that have at least one MISSED call.
    if (query.missedOnly) {
      where.calls = { some: { status: "MISSED", deletedAt: null } };
    }
    if (query.dateFrom || query.dateTo) {
      where.createdAt = {};
      if (query.dateFrom) (where.createdAt as Prisma.DateTimeFilter).gte = new Date(query.dateFrom);
      if (query.dateTo) (where.createdAt as Prisma.DateTimeFilter).lte = new Date(query.dateTo);
    }
    if (query.q) {
      const normalized = (() => {
        try {
          return normalizePhone(query.q);
        } catch {
          return null;
        }
      })();
      where.OR = [
        { title: { contains: query.q, mode: "insensitive" } },
        { contact: { fullName: { contains: query.q, mode: "insensitive" } } },
        ...(normalized ? [{ contact: { phones: { has: normalized } } }] : []),
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.t.card.findMany({
        where,
        orderBy: [{ stageId: "asc" }, { enteredStageAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          contact: { select: { id: true, fullName: true, phones: true, email: true } },
          cardTags: { include: { tag: true } },
          responsible: { select: { id: true, fullName: true, email: true } },
          // Pull recent call statuses so the board can show a red "missed"
          // badge without an extra round-trip.
          calls: {
            where: { deletedAt: null },
            orderBy: { startedAt: "desc" },
            take: 5,
            select: { id: true, status: true, direction: true, startedAt: true },
          },
          // Most-recent SMS so the Kanban card can show "SMS yuborildi" badge
          // with timestamp + status. Single-row select keeps the payload small.
          smsLogs: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { id: true, status: true, createdAt: true, sentAt: true },
          },
        },
      }),
      this.prisma.t.card.count({ where }),
    ]);
    // Derive UI flags. lastSms condenses the take:1 list so the frontend
    // doesn't have to peek into smsLogs[0].
    const items = rows.map((card) => ({
      ...card,
      hasMissedCall: card.calls.some((c) => c.status === "MISSED"),
      lastCall: card.calls[0] ?? null,
      lastSms: card.smsLogs[0] ?? null,
    }));
    return { items, total, page, pageSize };
  }

  async findById(id: string) {
    const card = await this.prisma.t.card.findFirst({
      where: { id, deletedAt: null },
      include: {
        contact: true,
        cardTags: { include: { tag: true } },
        responsible: { select: { id: true, fullName: true, email: true } },
        branch: { select: { id: true, name: true } },
        pipeline: { select: { id: true, name: true } },
        stage: { select: { id: true, name: true, color: true, type: true } },
        tasks: {
          where: { deletedAt: null },
          orderBy: { dueAt: "asc" },
          include: { assignee: { select: { id: true, fullName: true } } },
        },
        notes: {
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
          include: { author: { select: { id: true, fullName: true } } },
        },
        calls: {
          orderBy: { startedAt: "desc" },
          take: 5,
          include: {
            // Operator extension + branch surface in the call-row UI so the
            // supervisor sees "Aziz (101) · Chilonzor" without an extra fetch.
            operator: { select: { id: true, fullName: true, extension: true } },
            branch: { select: { id: true, name: true } },
          },
        },
        smsLogs: {
          orderBy: { createdAt: "desc" },
          take: 5,
        },
      },
    });
    if (!card) throw new NotFoundException("Card not found");
    return card;
  }

  async update(id: string, dto: UpdateCardDto) {
    const tenantId = this.currentTenantId();
    const existing = await this.prisma.t.card.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException("Card not found");
    const data: Prisma.CardUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.responsibleUserId !== undefined) {
      data.responsible = dto.responsibleUserId
        ? { connect: { id: dto.responsibleUserId } }
        : { disconnect: true };
    }
    if (dto.branchId !== undefined) {
      data.branch = dto.branchId ? { connect: { id: dto.branchId } } : { disconnect: true };
    }
    if (dto.dueDate !== undefined) data.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
    if (dto.budget !== undefined) data.budget = new Prisma.Decimal(dto.budget);
    const card = await this.prisma.t.card.update({ where: { id }, data });
    this.realtime.toTenant(tenantId, SOCKET_EVENTS.CARD_UPDATED, { card });
    return card;
  }

  async softDelete(id: string): Promise<{ id: string }> {
    const tenantId = this.currentTenantId();
    const card = await this.prisma.t.card.findFirst({
      where: { id, deletedAt: null },
    });
    if (!card) throw new NotFoundException("Card not found");
    await this.prisma.t.card.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    this.realtime.toTenant(tenantId, SOCKET_EVENTS.CARD_UPDATED, { card: { id, deleted: true } });
    return { id };
  }

  /**
   * Move a card to a new stage. Updates stageId, enteredStageAt, and the
   * card.status depending on the target stage's type (WON/LOST close the
   * deal). The AuditInterceptor records the action; we also push the
   * change live over Socket.io so other operators see it instantly.
   */
  async move(id: string, dto: MoveCardDto) {
    const tenantId = this.currentTenantId();
    const card = await this.prisma.t.card.findFirst({
      where: { id, deletedAt: null },
    });
    if (!card) throw new NotFoundException("Card not found");
    const targetStage = await this.prisma.t.stage.findFirst({
      where: { id: dto.stageId, pipelineId: card.pipelineId, deletedAt: null },
    });
    if (!targetStage) {
      throw new BadRequestException("Target stage not found in this card's pipeline");
    }
    const nextStatus =
      targetStage.type === StageType.WON
        ? "WON"
        : targetStage.type === StageType.LOST
          ? "LOST"
          : "OPEN";
    if (targetStage.type === StageType.LOST && !dto.lostReason?.trim()) {
      throw new BadRequestException("Yo'qotilgan karta uchun sabab tanlash kerak");
    }
    const lostReason = dto.lostReason?.trim() ?? null;
    const updated = await this.prisma.t.card.update({
      where: { id },
      data: {
        stageId: targetStage.id,
        enteredStageAt: new Date(),
        status: nextStatus,
        lostReason:
          targetStage.type === StageType.LOST ? lostReason : null,
      },
    });
    this.realtime.toTenant(tenantId, SOCKET_EVENTS.CARD_MOVED, {
      cardId: id,
      fromStageId: card.stageId,
      toStageId: targetStage.id,
      status: nextStatus,
      enteredStageAt: updated.enteredStageAt,
    });
    const evt: CardMovedEvent = {
      tenantId,
      at: new Date(),
      cardId: id,
      pipelineId: card.pipelineId,
      fromStageId: card.stageId,
      toStageId: targetStage.id,
      status: nextStatus,
    };
    this.events.emit(EVT.CARD_MOVED, evt);
    return updated;
  }
}
