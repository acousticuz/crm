import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ClsService } from "nestjs-cls";
import {
  CallDirection,
  CallStatus,
  SOCKET_EVENTS,
  TaskType,
  UserRole,
} from "@acoustic-crm/shared";
import { readContext } from "../../common/tenant-context";
import { normalizePhone } from "../../common/phone";
import { PrismaService } from "../prisma/prisma.service";
import { RealtimeService } from "../realtime/realtime.service";
import {
  CallCompletedDto,
  CallIncomingDto,
  OriginateCallDto,
} from "./dto/call.dto";

@Injectable()
export class CallsService {
  private readonly logger = new Logger(CallsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
    private readonly realtime: RealtimeService,
    private readonly config: ConfigService,
  ) {}

  private currentUser(): { tenantId: string; userId: string | null; role: UserRole | null } {
    const ctx = readContext(this.cls);
    if (!ctx.tenantId) throw new UnauthorizedException("No tenant context");
    return { tenantId: ctx.tenantId, userId: ctx.userId, role: ctx.role };
  }

  // ===== Inbound flow (worker → backend) =====

  /**
   * Worker reports a freshly ringing inbound channel. We don't persist a
   * Call row yet — that happens at completion time when we know status and
   * duration. We DO emit the screen-pop event over Socket.io with a contact
   * lookup so the right operator sees the caller's card.
   */
  async incoming(dto: CallIncomingDto) {
    const fromNorm = normalizePhone(dto.fromNumber);
    const contact = await this.prisma.t.contact.findFirst({
      where: { phones: { has: fromNorm }, deletedAt: null },
      select: { id: true, fullName: true, phones: true, email: true },
    });
    const openCard = contact
      ? await this.prisma.t.card.findFirst({
          where: { contactId: contact.id, deletedAt: null, status: "OPEN" },
          select: { id: true, title: true, stageId: true, pipelineId: true },
        })
      : null;
    this.realtime.toTenant(dto.tenantId, SOCKET_EVENTS.CALL_INCOMING, {
      cdrUniqueId: dto.cdrUniqueId,
      fromNumber: fromNorm,
      toNumber: dto.toNumber,
      operatorId: dto.operatorId ?? null,
      contact,
      card: openCard,
    });
    return { matched: !!contact, contactId: contact?.id ?? null, cardId: openCard?.id ?? null };
  }

  /**
   * Worker reports a call has ended. Upsert by (tenantId, cdrUniqueId) so
   * retries are idempotent. If the call was MISSED, auto-create a callback
   * Task assigned to the operator (or, when no operator, the first admin).
   */
  async completed(dto: CallCompletedDto) {
    const fromNorm = normalizePhone(dto.fromNumber);
    const toNorm = (() => {
      try {
        return normalizePhone(dto.toNumber);
      } catch {
        return dto.toNumber;
      }
    })();

    // Find the contact that owns the customer-side number (depending on
    // direction). Then find an open card linked to that contact.
    const customerPhone = dto.direction === CallDirection.INBOUND ? fromNorm : toNorm;
    const contact = await this.prisma.t.contact.findFirst({
      where: { phones: { has: customerPhone }, deletedAt: null },
    });
    const card = contact
      ? await this.prisma.t.card.findFirst({
          where: { contactId: contact.id, deletedAt: null, status: "OPEN" },
          orderBy: { enteredStageAt: "desc" },
        })
      : null;

    const call = await this.prisma.t.call.upsert({
      where: {
        tenantId_cdrUniqueId: { tenantId: dto.tenantId, cdrUniqueId: dto.cdrUniqueId },
      },
      create: {
        tenantId: dto.tenantId,
        cdrUniqueId: dto.cdrUniqueId,
        direction: dto.direction,
        fromNumber: fromNorm,
        toNumber: toNorm,
        status: dto.status,
        startedAt: new Date(dto.startedAt),
        duration: dto.duration,
        recordingUrl: dto.recordingUrl ?? null,
        operatorId: dto.operatorId ?? null,
        contactId: contact?.id ?? null,
        cardId: card?.id ?? null,
      },
      update: {
        status: dto.status,
        duration: dto.duration,
        recordingUrl: dto.recordingUrl ?? null,
        contactId: contact?.id ?? null,
        cardId: card?.id ?? null,
      },
    });

    if (dto.status === CallStatus.MISSED && contact) {
      const assignee = dto.operatorId
        ?? card?.responsibleUserId
        ?? (await this.firstAdminUserId(dto.tenantId));
      if (assignee) {
        await this.prisma.task.create({
          data: {
            tenantId: dto.tenantId,
            cardId: card?.id ?? null,
            contactId: contact.id,
            assigneeId: assignee,
            type: TaskType.CALL,
            text: `Javobsiz qo'ng'iroq: ${contact.fullName} (${customerPhone}) ga qayta qo'ng'iroq qiling`,
            dueAt: new Date(Date.now() + 60 * 60_000), // 1 hour from now
          },
        });
      } else {
        this.logger.warn(
          `MISSED call ${call.id} — no operator/admin to assign callback Task to`,
        );
      }
    }

    this.realtime.toTenant(dto.tenantId, SOCKET_EVENTS.CALL_ENDED, { call });
    return call;
  }

  private async firstAdminUserId(tenantId: string): Promise<string | null> {
    const u = await this.prisma.user.findFirst({
      where: {
        tenantId,
        deletedAt: null,
        role: { in: ["TENANT_ADMIN", "SUPERVISOR"] },
        status: "ACTIVE",
      },
      select: { id: true },
    });
    return u?.id ?? null;
  }

  // ===== Outbound flow (operator click-to-call → worker) =====

  /**
   * Sends an Originate request to the telephony-worker over HTTP. The worker
   * executes the AMI command and later reports completion via the same
   * /internal/calls/completed pipeline.
   *
   * The CRM does NOT block the operator on the AMI handshake — fire-and-
   * forget, the call will appear in the card's history once it ends.
   */
  async originate(dto: OriginateCallDto) {
    const { tenantId, userId } = this.currentUser();
    if (!userId) throw new UnauthorizedException("Operator identity missing");

    const toNorm = normalizePhone(dto.toNumber);
    const workerUrl = this.config.get<string>(
      "TELEPHONY_WORKER_URL",
      "http://localhost:3008",
    );
    const sharedSecret = this.config.get<string>("TELEPHONY_WORKER_SECRET", "");

    // Look up the operator's extension from User settings (placeholder for
    // now — schema doesn't have an `extension` column on User. M11 admin
    // settings will surface this per-operator. Fallback to operator ID).
    const fromExtension = userId;

    // Pre-generate a CDR id we can correlate when the worker reports back.
    const cdrUniqueId = `out-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    try {
      const res = await fetch(`${workerUrl.replace(/\/$/, "")}/worker/originate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Worker-Secret": sharedSecret,
        },
        body: JSON.stringify({
          tenantId,
          cdrUniqueId,
          operatorId: userId,
          fromExtension,
          toNumber: toNorm,
          cardId: dto.cardId,
        }),
      });
      if (!res.ok) {
        throw new BadRequestException(`Worker returned HTTP ${res.status}`);
      }
      return { cdrUniqueId, queued: true };
    } catch (err) {
      this.logger.error(`Originate failed: ${(err as Error).message}`);
      throw new BadRequestException(
        `Could not reach telephony-worker at ${workerUrl}: ${(err as Error).message}`,
      );
    }
  }

  // ===== Listing =====

  listByCard(cardId: string) {
    return this.prisma.t.call.findMany({
      where: { cardId, deletedAt: null },
      orderBy: { startedAt: "desc" },
      take: 50,
      include: { operator: { select: { id: true, fullName: true } } },
    });
  }

  listByContact(contactId: string) {
    return this.prisma.t.call.findMany({
      where: { contactId, deletedAt: null },
      orderBy: { startedAt: "desc" },
      take: 50,
      include: { operator: { select: { id: true, fullName: true } } },
    });
  }

  async findById(id: string) {
    const call = await this.prisma.t.call.findFirst({
      where: { id, deletedAt: null },
      include: {
        operator: { select: { id: true, fullName: true } },
        contact: { select: { id: true, fullName: true, phones: true } },
        card: { select: { id: true, title: true } },
      },
    });
    if (!call) throw new NotFoundException("Call not found");
    return call;
  }
}
