import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { execFileSync } from "node:child_process";
import type { Queue } from "bullmq";
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
import { STT_QUEUE } from "../queue/queue.module";
import {
  CallCompletedDto,
  CallIncomingDto,
  CallStartedDto,
  OriginateCallDto,
} from "./dto/call.dto";


interface AcousticPhoneLookup {
  found?: boolean;
  client_id?: number;
  client_name?: string | null;
  phone_number?: string | null;
  birthday?: string | null;
  gender?: string | null;
  city?: string | null;
  last_purchase_date?: string | null;
  last_purchase_branch_id?: number | null;
  last_purchase_branch_name?: string | null;
  lifetime_amount?: number;
  products?: Array<{
    product_ref_id?: number | null;
    product_name?: string | null;
    quantity?: number | null;
  }>;
}

@Injectable()
export class CallsService {
  private readonly logger = new Logger(CallsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
    private readonly realtime: RealtimeService,
    private readonly config: ConfigService,
    private readonly integrations: IntegrationsService,
    @Optional() @Inject(STT_QUEUE) private readonly sttQueue?: Pick<Queue, "add">,
  ) {}

  /**
   * Hand an answered call to the STT queue so ai-worker transcribes it and the
   * analysis + QA pipeline runs. The mock STT adapter ignores the recording
   * URL; the Whisper adapter needs a reachable audio file.
   */
  private async enqueueTranscription(
    callId: string,
    tenantId: string,
    cdrUniqueId: string,
    recordingUrl: string,
    delayMs = 0,
  ) {
    if (!this.sttQueue) {
      throw new ServiceUnavailableException("STT navbati hozir mavjud emas");
    }
    await this.sttQueue.add(
      "stt",
      { callId, tenantId, cdrUniqueId, recordingUrl: recordingUrl || undefined, language: "uz" },
      { delay: delayMs, attempts: 3, removeOnComplete: 100, removeOnFail: 50 },
    );
  }

  /**
   * Operator/supervisor-triggered analysis: enqueues the full STT → analysis
   * → QA chain for one call. STT + LLM are paid services, so this is the
   * ONLY entry point — `completed()` no longer auto-enqueues. If the call
   * already has an Analysis row we refuse unless `force=true` (Qayta tahlil),
   * which drops the prior transcript/analysis/QA so the chain re-runs clean.
   */
  async analyze(callId: string, force = false) {
    const { tenantId } = this.currentUser();
    const call = await this.prisma.t.call.findFirst({
      where: { id: callId, deletedAt: null },
      include: { analysis: true, transcript: true },
    });
    if (!call) throw new NotFoundException("Qo'ng'iroq topilmadi");
    if (call.status !== CallStatus.ANSWERED) {
      throw new BadRequestException(
        "Faqat javob berilgan (ANSWERED) qo'ng'iroqlarni tahlil qilish mumkin",
      );
    }
    if (call.analysis && !force) {
      throw new ConflictException(
        "Bu qo'ng'iroq allaqachon tahlil qilingan. Qayta ishga tushirish uchun ?force=true",
      );
    }
    if (force && (call.analysis || call.transcript)) {
      // Tear down dependent rows so the new run starts from a clean slate;
      // otherwise the upsert chain leaves stale QA scores around.
      await this.prisma.qAScore.deleteMany({ where: { callId } });
      await this.prisma.analysis.deleteMany({ where: { callId } });
      await this.prisma.transcript.deleteMany({ where: { callId } });
    }
    await this.enqueueTranscription(
      call.id,
      tenantId,
      call.cdrUniqueId ?? call.id,
      call.recordingUrl ?? "",
      // No delay on manual analyze — the recording is already on disk.
    );
    this.realtime.toTenant(tenantId, SOCKET_EVENTS.ANALYSIS_STARTED, { callId: call.id });
    return { enqueued: true, callId: call.id, force };
  }

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
    const acoustic = await this.lookupAcousticByPhone(phone);
    const acousticFields = acoustic?.found
      ? {
          clientId: acoustic.client_id ?? null,
          clientName: acoustic.client_name ?? null,
          phoneNumber: acoustic.phone_number ?? phone,
          birthday: acoustic.birthday ?? null,
          gender: acoustic.gender ?? null,
          city: acoustic.city ?? null,
          lastPurchaseDate: acoustic.last_purchase_date ?? null,
          lastPurchaseBranchId: acoustic.last_purchase_branch_id ?? null,
          lastPurchaseBranchName: acoustic.last_purchase_branch_name ?? null,
          lifetimeAmount: acoustic.lifetime_amount ?? 0,
          products: acoustic.products ?? [],
          syncedAt: new Date().toISOString(),
        }
      : null;
    const fullName = acoustic?.client_name?.trim() || "Noma'lum";

    const existing = await this.prisma.t.contact.findFirst({
      where: { phones: { has: phone }, deletedAt: null },
    });
    if (existing) {
      const existingCustom = this.asObject(existing.customFields);
      const shouldUpdateName =
        acoustic?.client_name?.trim() &&
        (!existing.fullName || existing.fullName.trim().toLowerCase().startsWith("noma"));
      if (acousticFields || shouldUpdateName) {
        return this.prisma.t.contact.update({
          where: { id: existing.id },
          data: {
            ...(shouldUpdateName ? { fullName } : {}),
            ...(acousticFields
              ? {
                  customFields: {
                    ...existingCustom,
                    acousticAnalytics: acousticFields,
                  },
                }
              : {}),
          },
        });
      }
      return existing;
    }
    return this.prisma.t.contact.create({
      data: {
        tenantId,
        fullName,
        phones: [phone],
        source,
        ...(acousticFields
          ? {
              customFields: {
                acousticAnalytics: acousticFields,
              },
            }
          : {}),
      },
    });
  }

  private async lookupAcousticByPhone(phone: string): Promise<AcousticPhoneLookup | null> {
    const base = this.config.get<string>("ACOUSTIC_API_URL", "").replace(/\/$/, "");
    const key = this.config.get<string>("ACOUSTIC_INTERNAL_API_KEY", "");
    if (!base || !key) return null;
    try {
      const url = new URL(`${base}/v1/clients/by-phone`);
      url.searchParams.set("phone", phone);
      const res = await fetch(url, { headers: { "X-Internal-Key": key } });
      if (!res.ok) return null;
      const payload = (await res.json().catch(() => null)) as AcousticPhoneLookup | null;
      return payload?.found ? payload : null;
    } catch (err) {
      this.logger.warn(`Acoustic phone lookup failed for ${phone}: ${(err as Error).message}`);
      return null;
    }
  }

  private asObject(value: unknown): Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
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

    // Every real customer call should surface on Kanban. Create/reuse the
    // contact and open card for both inbound and outbound calls.
    const contact = await this.resolveOrCreateContact(
      dto.tenantId,
      customerRaw,
      isInbound ? "inbound_call" : "outbound_call",
    );
    const card = contact ? await this.openOrCreateCardFor(dto.tenantId, contact) : null;

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

    // Every completed real customer call should have a contact and an open
    // Kanban card. `started` usually created them already; this keeps retries
    // and missed started-events safe.
    const contact = await this.resolveOrCreateContact(
      dto.tenantId,
      customerRaw,
      isInbound ? "inbound_call" : "outbound_call",
    );
    const card = contact ? await this.openOrCreateCardFor(dto.tenantId, contact) : null;

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

    // STT + LLM analysis are paid services — never run them automatically on
    // every answered call. The supervisor/operator launches them per-call via
    // POST /calls/:id/analyze (Tahlil qil button).
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

  /**
   * Resolve the local path of a call's recording (tenant-scoped). Recording
   * filenames end with the Asterisk uniqueid (= cdrUniqueId) for inbound calls.
   * Returns null when there's no recording (e.g. missed, or outbound whose id
   * is CRM-generated). Used by the audio-playback endpoint.
   */
  async recordingPath(callId: string): Promise<string | null> {
    this.currentUser();
    const call = await this.prisma.t.call.findFirst({ where: { id: callId, deletedAt: null } });
    if (!call) return null;
    const dir = this.config.get<string>("RECORDINGS_DIR", "");
    const uid = call.cdrUniqueId;
    if (!dir || !uid || !/^[\d.]+$/.test(uid)) return null;
    // FreePBX organizes recordings as <dir>/YYYY/MM/DD/. Narrow the find root
    // to the call's date so an sshfs/NFS mount doesn't time out walking the
    // whole tree. Falls back to the full dir if the day subfolder is missing
    // (e.g. clock skew, manual file move). 30s timeout for the same reason.
    const fs = await import("node:fs");
    const iso = (call.startedAt instanceof Date ? call.startedAt : new Date(call.startedAt))
      .toISOString().slice(0, 10);
    const [yyyy, mm, dd] = iso.split("-");
    const dayDir = `${dir}/${yyyy}/${mm}/${dd}`;
    const searchRoot = fs.existsSync(dayDir) ? dayDir : dir;
    try {
      const out = execFileSync(
        "find",
        [searchRoot, "-name", `*${uid}.wav`, "-type", "f", "-size", "+1k"],
        { encoding: "utf8", timeout: 30_000 },
      ).trim();
      return out.split("\n").filter(Boolean)[0] ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Branch list for the per-call branch dropdown. Tenant-scoped via `t.`.
   */
  listBranches() {
    return this.prisma.t.branch.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
  }

  /**
   * Manually attach a branch to a call — the customer-asked-for branch, set
   * by the operator post-hoc. Feeds the monthly per-branch funnel report and,
   * when the parent card has no branch yet, promotes the choice onto the
   * card so the Kanban branch filter surfaces it.
   */
  async setBranch(callId: string, branchId: string | null) {
    const { tenantId } = this.currentUser();
    const call = await this.prisma.t.call.findFirst({
      where: { id: callId, deletedAt: null },
      select: { id: true, cardId: true },
    });
    if (!call) throw new NotFoundException("Qo'ng'iroq topilmadi");
    if (branchId) {
      const b = await this.prisma.branch.findFirst({
        where: { id: branchId, tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!b) throw new BadRequestException("Bunday filial topilmadi");
    }
    const updated = await this.prisma.t.call.update({
      where: { id: callId },
      data: { branchId },
      include: { branch: { select: { id: true, name: true } } },
    });
    // Forward-propagate to the parent card when it has no branch yet — so
    // attaching a branch on a call also makes the card show up under that
    // branch in the Kanban filter. Don't overwrite a card whose branch was
    // already set (e.g. an explicit operator pick elsewhere).
    if (call.cardId && branchId) {
      await this.prisma.t.card.updateMany({
        where: { id: call.cardId, branchId: null, deletedAt: null },
        data: { branchId },
      });
    }
    return updated;
  }

  // ===== Listing =====

  listByCard(cardId: string) {
    return this.prisma.t.call.findMany({
      where: { cardId, deletedAt: null },
      orderBy: { startedAt: "desc" },
      take: 50,
      include: {
        operator: { select: { id: true, fullName: true, extension: true } },
        branch: { select: { id: true, name: true } },
      },
    });
  }

  listByContact(contactId: string) {
    return this.prisma.t.call.findMany({
      where: { contactId, deletedAt: null },
      orderBy: { startedAt: "desc" },
      take: 50,
      include: {
        operator: { select: { id: true, fullName: true, extension: true } },
        branch: { select: { id: true, name: true } },
      },
    });
  }

  /**
   * Tenant-wide recent calls feed for the Calls page. Surfaces the contact
   * (so the UI can flag "Noma'lum" rows and offer a quick rename) and the
   * linked card. `missedOnly` filters to MISSED rows, used by the dashboard's
   * "missed calls" tile.
   */
  listRecent(opts: {
    limit?: number;
    missedOnly?: boolean;
    dateFrom?: string;
    dateTo?: string;
  }) {
    const take = Math.min(Math.max(opts.limit ?? 100, 1), 500);
    // Date filter is inclusive on dateFrom (>= 00:00) and exclusive on dateTo
    // + 1 day (< next day 00:00) so the user's intent of "show me 2026-06-01
    // to 2026-06-28" includes the full 28th day.
    const startedAt: Record<string, Date> = {};
    if (opts.dateFrom) startedAt.gte = new Date(opts.dateFrom);
    if (opts.dateTo) {
      const to = new Date(opts.dateTo);
      to.setDate(to.getDate() + 1);
      startedAt.lt = to;
    }
    return this.prisma.t.call.findMany({
      where: {
        deletedAt: null,
        ...(opts.missedOnly ? { status: CallStatus.MISSED } : {}),
        ...(Object.keys(startedAt).length ? { startedAt } : {}),
      },
      orderBy: { startedAt: "desc" },
      take,
      include: {
        operator: { select: { id: true, fullName: true, extension: true } },
        contact: { select: { id: true, fullName: true, phones: true } },
        card: { select: { id: true, title: true } },
        branch: { select: { id: true, name: true } },
      },
    });
  }

  async findById(id: string) {
    const call = await this.prisma.t.call.findFirst({
      where: { id, deletedAt: null },
      include: {
        operator: { select: { id: true, fullName: true, extension: true } },
        contact: { select: { id: true, fullName: true, phones: true } },
        card: { select: { id: true, title: true } },
        branch: { select: { id: true, name: true } },
      },
    });
    if (!call) throw new NotFoundException("Call not found");
    return call;
  }
}
