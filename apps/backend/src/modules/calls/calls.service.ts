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
import { normalizePhone, tryNormalizePhone } from "../../common/phone";
import { PrismaService } from "../prisma/prisma.service";
import { RealtimeService } from "../realtime/realtime.service";
import { IntegrationsService } from "../integrations/integrations.service";
import {
  CallCompletedDto,
  CallIncomingDto,
  CallStartedDto,
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
    private readonly integrations: IntegrationsService,
  ) {}

  /**
   * Cross-tenant decrypted FreePBX/AMI configs for the telephony worker to
   * connect with. Only reachable via the worker-secret guard.
   */
  freePbxConfigsForWorker() {
    return this.integrations.listFreePbxConfigsForWorker();
  }

  private currentUser(): { tenantId: string; userId: string | null; role: UserRole | null } {
    const ctx = readContext(this.cls);
    if (!ctx.tenantId) throw new UnauthorizedException("No tenant context");
    return { tenantId: ctx.tenantId, userId: ctx.userId, role: ctx.role };
  }

  // ===== Inbound flow (worker → backend) =====

  /**
   * Resolve the contact for a phone, CREATING a "Noma'lum" placeholder if no
   * contact owns the number. Idempotent — repeated calls from the same
   * unknown number reuse the contact (no duplicates). Returns null only when
   * the phone is unusable (empty/internal channel).
   */
  private async resolveOrCreateContact(
    tenantId: string,
    rawPhone: string,
    source: string,
  ) {
    const phone = tryNormalizePhone(rawPhone);
    if (!phone) return null;
    const existing = await this.prisma.t.contact.findFirst({
      where: { phones: { has: phone }, deletedAt: null },
    });
    if (existing) return existing;
    return this.prisma.t.contact.create({
      data: {
        tenantId,
        fullName: "Noma'lum",
        phones: [phone],
        source,
      },
    });
  }

  private async openCardFor(contactId: string) {
    return this.prisma.t.card.findFirst({
      where: { contactId, deletedAt: null, status: "OPEN" },
      orderBy: { enteredStageAt: "desc" },
    });
  }

  /**
   * Return the contact's open card, or CREATE one in the tenant's default
   * pipeline's first stage so the call shows up on the Kanban board. Without
   * this, inbound calls attach to a contact but never surface as a card.
   * Idempotent: repeated calls from the same number reuse the open card.
   */
  private async openOrCreateCardFor(
    tenantId: string,
    contact: { id: string; fullName: string; phones: string[] },
  ) {
    const existing = await this.openCardFor(contact.id);
    if (existing) return existing;
    const pipeline = await this.prisma.t.pipeline.findFirst({
      where: { deletedAt: null },
      orderBy: [{ isDefault: "desc" }, { order: "asc" }],
    });
    if (!pipeline) return null;
    const stage = await this.prisma.t.stage.findFirst({
      where: { pipelineId: pipeline.id, deletedAt: null },
      orderBy: { order: "asc" },
    });
    if (!stage) return null;
    const title =
      contact.fullName && contact.fullName !== "Noma'lum"
        ? contact.fullName
        : (contact.phones[0] ?? "Yangi qo'ng'iroq");
    const created = await this.prisma.t.card.create({
      data: {
        tenantId,
        pipelineId: pipeline.id,
        stageId: stage.id,
        contactId: contact.id,
        title,
        status: "OPEN",
        enteredStageAt: new Date(),
      },
    });
    // Tell connected boards a new card appeared so it shows up live.
    this.realtime.toTenant(tenantId, SOCKET_EVENTS.CARD_CREATED, {
      cardId: created.id,
      stageId: created.stageId,
    });
    return created;
  }

  /**
   * Worker reports a channel has STARTED ringing. The Call row is created
   * immediately (status=RINGING) so a call is never lost even if it's never
   * answered — `completed` later updates the final status. Inbound calls from
   * unknown numbers auto-create a "Noma'lum" contact. A screen-pop is emitted
   * for inbound calls.
   */
  async started(dto: CallStartedDto) {
    const isInbound = dto.direction === CallDirection.INBOUND;
    const customerRaw = isInbound ? dto.fromNumber : dto.toNumber;
    const fromNorm = tryNormalizePhone(dto.fromNumber) ?? (dto.fromNumber || "unknown");
    const toNorm = tryNormalizePhone(dto.toNumber) ?? (dto.toNumber || "unknown");

    // Internal/Local channels without a usable external number aren't real
    // customer calls — skip without persisting.
    if (!tryNormalizePhone(customerRaw)) {
      return { ignored: true, callId: null, contactId: null, cardId: null };
    }

    // Inbound: create a "Noma'lum" contact if unknown. Outbound: link if the
    // dialed number already belongs to a contact, else leave null.
    const contact = isInbound
      ? await this.resolveOrCreateContact(dto.tenantId, customerRaw, "inbound_call")
      : await this.prisma.t.contact.findFirst({
          where: { phones: { has: tryNormalizePhone(customerRaw)! }, deletedAt: null },
        });
    const card = contact
      ? isInbound
        ? await this.openOrCreateCardFor(dto.tenantId, contact)
        : await this.openCardFor(contact.id)
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
        status: CallStatus.RINGING,
        startedAt: dto.startedAt ? new Date(dto.startedAt) : new Date(),
        operatorId: dto.operatorId ?? null,
        contactId: contact?.id ?? null,
        cardId: card?.id ?? null,
      },
      update: {
        // started may arrive twice (retry) — keep RINGING, refresh links.
        contactId: contact?.id ?? null,
        cardId: card?.id ?? null,
        operatorId: dto.operatorId ?? undefined,
      },
    });

    if (isInbound) {
      this.realtime.toTenant(dto.tenantId, SOCKET_EVENTS.CALL_INCOMING, {
        cdrUniqueId: dto.cdrUniqueId,
        callId: call.id,
        fromNumber: fromNorm,
        toNumber: toNorm,
        operatorId: dto.operatorId ?? null,
        contact: contact
          ? { id: contact.id, fullName: contact.fullName, phones: contact.phones, email: contact.email }
          : null,
        card: card ? { id: card.id, title: card.title } : null,
      });
    }

    return { callId: call.id, contactId: contact?.id ?? null, cardId: card?.id ?? null };
  }

  /**
   * Legacy screen-pop-only entrypoint kept for compatibility. Delegates to
   * `started` so a Call row is always created.
   */
  async incoming(dto: CallIncomingDto) {
    const r = await this.started({
      tenantId: dto.tenantId,
      cdrUniqueId: dto.cdrUniqueId,
      direction: CallDirection.INBOUND,
      fromNumber: dto.fromNumber,
      toNumber: dto.toNumber,
      operatorId: dto.operatorId,
    });
    return { matched: !!r.contactId, contactId: r.contactId, cardId: r.cardId, ignored: r.ignored };
  }

  /**
   * Worker reports a call has ended. Upsert by (tenantId, cdrUniqueId) so
   * retries are idempotent. If the call was MISSED, auto-create a callback
   * Task assigned to the operator (or, when no operator, the first admin).
   */
  async completed(dto: CallCompletedDto) {
    // Be tolerant of empty/internal channel numbers — store the raw value as
    // a fallback so the Call row is never lost, even if it can't be matched
    // to a contact.
    const fromNorm = tryNormalizePhone(dto.fromNumber) ?? (dto.fromNumber || "unknown");
    const toNorm = tryNormalizePhone(dto.toNumber) ?? (dto.toNumber || "unknown");
    const isInbound = dto.direction === CallDirection.INBOUND;
    const customerRaw = isInbound ? dto.fromNumber : dto.toNumber;

    // Resolve the customer contact. For inbound calls we CREATE a "Noma'lum"
    // contact if unknown so no call/number is ever lost (idempotent). For
    // outbound we only link to an existing contact.
    const contact = isInbound
      ? await this.resolveOrCreateContact(dto.tenantId, customerRaw, "inbound_call")
      : tryNormalizePhone(customerRaw)
        ? await this.prisma.t.contact.findFirst({
            where: { phones: { has: tryNormalizePhone(customerRaw)! }, deletedAt: null },
          })
        : null;
    const card = contact
      ? isInbound
        ? await this.openOrCreateCardFor(dto.tenantId, contact)
        : await this.openCardFor(contact.id)
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
        endedAt: new Date(),
        duration: dto.duration,
        recordingUrl: dto.recordingUrl ?? null,
        operatorId: dto.operatorId ?? null,
        contactId: contact?.id ?? null,
        cardId: card?.id ?? null,
      },
      update: {
        // Finalize the RINGING row created by `started`.
        status: dto.status,
        endedAt: new Date(),
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
            text: `Javobsiz qo'ng'iroq: ${contact.fullName} (${isInbound ? fromNorm : toNorm}) ga qayta qo'ng'iroq qiling`,
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

    // Ring the operator's real PJSIP extension (set per-operator in user
    // management). Fall back to the user id only if no extension is configured
    // yet — that won't dial on a real PBX, but keeps dev/mock flows working.
    const operator = await this.prisma.t.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { extension: true },
    });
    const fromExtension = operator?.extension || userId;

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

  /**
   * Ask the telephony worker for the tenant's PBX extension list (via AMI
   * PJSIPShowEndpoints) so the admin can assign operators to real extensions.
   * Degrades gracefully to an empty list if the worker/PBX is unreachable.
   */
  async listPbxExtensions(): Promise<string[]> {
    const { tenantId } = this.currentUser();
    const workerUrl = this.config.get<string>("TELEPHONY_WORKER_URL", "http://localhost:3008");
    const sharedSecret = this.config.get<string>("TELEPHONY_WORKER_SECRET", "");
    try {
      const res = await fetch(
        `${workerUrl.replace(/\/$/, "")}/worker/extensions?tenantId=${encodeURIComponent(tenantId)}`,
        { headers: { "X-Worker-Secret": sharedSecret } },
      );
      if (!res.ok) return [];
      const data = (await res.json()) as { extensions?: string[] };
      return Array.isArray(data.extensions) ? data.extensions : [];
    } catch (err) {
      this.logger.warn(`Could not fetch PBX extensions: ${(err as Error).message}`);
      return [];
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
