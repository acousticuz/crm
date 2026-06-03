import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  UnauthorizedException,
} from "@nestjs/common";
import { ClsService } from "nestjs-cls";
import { SOCKET_EVENTS, UserRole, IntegrationType } from "@acoustic-crm/shared";
import type { Prisma } from "@prisma/client";
import { readContext } from "../../common/tenant-context";
import { normalizePhone } from "../../common/phone";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { IntegrationsService } from "../integrations/integrations.service";
import { RealtimeService } from "../realtime/realtime.service";
import { detectSensitiveCategories } from "./sensitivity";
import {
  ApproveDraftDto,
  InboxWebhookDto,
  ListThreadsQueryDto,
  RejectDraftDto,
  SendManualMessageDto,
} from "./dto/inbox.dto";

/**
 * AI draft is intentionally simple — a templated, non-committal reply that
 * acknowledges the customer and routes to an operator. The MockLlmAdapter
 * (M8) could be plugged in here for richer drafts, but we keep this layer
 * deterministic so safety tests are reliable.
 */
// Telegram update payload shapes. We accept the Bot API "Update" object and
// only the fields we actually read — everything else is ignored.
export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}
export interface TelegramMessage {
  message_id: number;
  date: number;
  text?: string;
  from?: { id: number; first_name?: string; last_name?: string; username?: string };
  chat: { id: number; type?: string; title?: string };
  contact?: { phone_number?: string; first_name?: string; user_id?: number };
}

function safeNormalize(raw: string): string | null {
  try {
    return normalizePhone(raw);
  } catch {
    return null;
  }
}

function generateDraft(customerText: string, channel: string): string {
  const lowered = customerText.toLowerCase();
  const greeting = "Assalomu alaykum! Murojaatingiz uchun rahmat.";
  const channelLine =
    channel === "instagram"
      ? "Instagram orqali yozganingiz biz uchun muhim."
      : channel.startsWith("facebook")
        ? "Facebook orqali bog'langaningiz uchun rahmat."
        : "Xabaringiz qabul qilindi.";
  const followUp =
    lowered.includes("salom") || lowered.length < 20
      ? "Sizga qanday yordam bera olamiz?"
      : "Tezroq aniq javob berish uchun operatorimiz tez orada siz bilan bog'lanadi.";
  return `${greeting}\n${channelLine}\n${followUp}`;
}

@Injectable()
export class InboxService implements OnModuleInit {
  private readonly logger = new Logger(InboxService.name);
  // Telegram polling driver. Tenants in inboundMode="polling" are ticked at
  // this interval; webhook tenants don't generate any work here. Cleared on
  // module destroy in tests so jest can exit cleanly.
  private pollTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
    private readonly audit: AuditService,
    private readonly integrations: IntegrationsService,
    private readonly realtime: RealtimeService,
  ) {}

  onModuleInit(): void {
    // Skip the background poller during jest so tests stay deterministic
    // and the worker doesn't leak open handles. Production starts it.
    if (process.env.NODE_ENV === "test") return;
    // Long-polling: each tick blocks up to ~25s waiting on Telegram. A 30s
    // interval keeps consecutive ticks from overlapping; configurable for
    // tenants who want shorter wake-ups (at the cost of more empty requests).
    const intervalMs = Number(process.env.TELEGRAM_POLL_INTERVAL_MS ?? 30_000);
    if (intervalMs <= 0) return;
    // Kick off immediately so a freshly-saved bot token gets ingest within
    // seconds — not on the next interval tick.
    this.tickAllPollingTenants().catch((err) => {
      this.logger.warn(`Telegram initial poll failed: ${(err as Error).message}`);
    });
    this.pollTimer = setInterval(() => {
      this.tickAllPollingTenants().catch((err) => {
        this.logger.warn(`Telegram polling tick failed: ${(err as Error).message}`);
      });
    }, intervalMs);
  }

  /** For tests / graceful shutdown — stop the background poller. */
  stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /** Decrypted page access token from the tenant's saved INBOX Integration. */
  async resolveInboxToken(tenantId: string): Promise<string | null> {
    const cfg = await this.integrations.getDecryptedConfig(tenantId, IntegrationType.INBOX);
    const token = cfg ? String(cfg.pageAccessToken ?? "") : "";
    return token || null;
  }

  /**
   * Deliver an outbound message to the social channel via the Graph API using
   * the tenant's saved INBOX integration. Fails soft (returns null) when no
   * integration is configured — the message is still recorded as SENT so the
   * lifecycle stays queryable.
   */
  private async dispatchToChannel(
    tenantId: string,
    thread: { channel: string; externalThreadId: string | null },
    text: string,
  ): Promise<string | null> {
    if (!thread.externalThreadId) return null;
    // Telegram replies go through the bot using the TELEGRAM integration's
    // saved botToken — not the INBOX integration. chat_id is whatever we
    // stored as externalThreadId at ingestion time.
    if (thread.channel === "telegram") {
      return this.dispatchTelegram(tenantId, thread.externalThreadId, text);
    }
    const token = await this.resolveInboxToken(tenantId);
    if (!token) {
      this.logger.debug?.(`Inbox send skipped — no INBOX integration for tenant ${tenantId}`);
      return null;
    }
    try {
      const res = await fetch(
        `https://graph.facebook.com/v19.0/me/messages?access_token=${encodeURIComponent(token)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recipient: { id: thread.externalThreadId },
            message: { text },
          }),
        },
      );
      const json = (await res.json().catch(() => ({}))) as { message_id?: string };
      return json.message_id ?? null;
    } catch (err) {
      this.logger.error(`Inbox send failed: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Send a single message to a Telegram chat via the tenant's bot. Returns
   * the message_id Telegram assigns (so we can deduplicate / quote later) or
   * null if the bot token isn't configured.
   */
  private async dispatchTelegram(
    tenantId: string,
    chatId: string,
    text: string,
  ): Promise<string | null> {
    const cfg = await this.integrations.getDecryptedConfig(tenantId, IntegrationType.TELEGRAM);
    const token = cfg ? String(cfg.botToken ?? "") : "";
    if (!token) {
      this.logger.warn(
        `Telegram reply skipped — no TELEGRAM integration / bot token for tenant ${tenantId}`,
      );
      return null;
    }
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        result?: { message_id?: number };
      };
      const id = json.result?.message_id;
      return id != null ? String(id) : null;
    } catch (err) {
      this.logger.error(`Telegram send failed: ${(err as Error).message}`);
      return null;
    }
  }

  private requireUser(): { userId: string; tenantId: string; role: UserRole } {
    const ctx = readContext(this.cls);
    if (!ctx.tenantId || !ctx.userId || !ctx.role) {
      throw new UnauthorizedException("Authentication required");
    }
    return { tenantId: ctx.tenantId, userId: ctx.userId, role: ctx.role };
  }

  // ===== Telegram inbound (webhook + polling) =====

  /**
   * Process one Telegram Update payload. Idempotent on (tenantId, channel,
   * externalMessageId) so retries / duplicate polls don't double-record.
   *
   * Returns null if the update has no usable message (e.g. an edited_message
   * or channel post) so callers can simply skip them.
   */
  async ingestTelegramUpdate(
    tenantId: string,
    update: TelegramUpdate,
  ): Promise<{ threadId: string; messageId: string } | null> {
    const msg = update.message;
    if (!msg || !msg.chat || msg.text == null) return null;
    const chatId = String(msg.chat.id);
    const updateMessageId = String(msg.message_id);

    // Identify or create the customer Contact. Prefer a phone match if the
    // user shared their number via the contact button; otherwise fall back
    // to a Noma'lum placeholder tagged with source=telegram so the operator
    // can rename later.
    const contact = await this.resolveTelegramContact(tenantId, msg);

    const thread = await this.prisma.inboxThread.upsert({
      where: {
        tenantId_channel_externalThreadId: {
          tenantId,
          channel: "telegram",
          externalThreadId: chatId,
        },
      },
      create: {
        tenantId,
        channel: "telegram",
        externalThreadId: chatId,
        contactId: contact.id,
        status: "OPEN",
        lastMessageAt: new Date(),
      },
      update: {
        contactId: contact.id,
        status: "OPEN",
        lastMessageAt: new Date(),
      },
    });

    // Idempotency: skip if we've already recorded this update_id for this
    // thread. The unique index on InboxMessage isn't there, but a quick
    // findFirst keeps polling safe.
    const dupe = await this.prisma.inboxMessage.findFirst({
      where: { tenantId, threadId: thread.id, externalMessageId: updateMessageId },
      select: { id: true },
    });
    if (dupe) return { threadId: thread.id, messageId: dupe.id };

    const senderName =
      msg.from?.first_name ??
      msg.from?.username ??
      contact.fullName ??
      "customer";
    const inbound = await this.prisma.inboxMessage.create({
      data: {
        tenantId,
        threadId: thread.id,
        direction: "INBOUND",
        sender: senderName,
        text: msg.text,
        externalMessageId: updateMessageId,
        sentAt: msg.date ? new Date(msg.date * 1000) : null,
        status: "RECEIVED",
      },
    });

    this.realtime.toTenant(tenantId, SOCKET_EVENTS.INBOX_MESSAGE, {
      threadId: thread.id,
      messageId: inbound.id,
      channel: "telegram",
      direction: "INBOUND",
    });

    await this.audit.log({
      tenantId,
      action: "inbox.telegram.received",
      entityType: "InboxMessage",
      entityId: inbound.id,
      details: { threadId: thread.id, chatId, fromId: msg.from?.id ?? null },
    });

    return { threadId: thread.id, messageId: inbound.id };
  }

  /**
   * Find or create the contact behind a Telegram message. If the user shared
   * a contact card (phone_number), prefer a phone match. Otherwise look the
   * chat up via an existing Telegram thread; if still nothing, create a
   * Noma'lum placeholder tagged source="telegram" — same convention used by
   * the inbound-call resolver so operators rename one way.
   */
  private async resolveTelegramContact(
    tenantId: string,
    msg: TelegramMessage,
  ): Promise<{ id: string; fullName: string }> {
    const phone =
      msg.contact?.phone_number != null ? safeNormalize(msg.contact.phone_number) : null;
    if (phone) {
      const byPhone = await this.prisma.contact.findFirst({
        where: { tenantId, deletedAt: null, phones: { has: phone } },
      });
      if (byPhone) return byPhone;
    }
    // Try to recover the contact via an existing Telegram thread for this chat.
    const existingThread = await this.prisma.inboxThread.findFirst({
      where: {
        tenantId,
        channel: "telegram",
        externalThreadId: String(msg.chat.id),
        deletedAt: null,
      },
      select: { contactId: true },
    });
    if (existingThread?.contactId) {
      const c = await this.prisma.contact.findFirst({
        where: { id: existingThread.contactId, tenantId, deletedAt: null },
      });
      if (c) return c;
    }
    const fullName =
      [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(" ").trim() ||
      msg.from?.username ||
      "Noma'lum";
    return this.prisma.contact.create({
      data: {
        tenantId,
        fullName,
        phones: phone ? [phone] : [],
        source: "telegram",
      },
    });
  }

  /**
   * Long-polling driver. Calls Telegram getUpdates with the stored offset,
   * processes each new update, then advances the offset on the Integration
   * config so the next tick only fetches newer ones.
   *
   * Polling is the DEFAULT — the only way to disable it is inboundMode="off"
   * (or "webhook"). Tenants whose admin just saved a botToken get inbound
   * out of the box, no extra config required. That mirrors what most
   * deployments want and matches the behavior the user reported was
   * missing.
   *
   * The Telegram timeout query is 25s (long-poll). Telegram caps it server
   * side, and a long wait dramatically reduces empty round-trips compared to
   * the previous timeout=0 which spammed the API every interval tick.
   */
  async tickTelegramPolling(tenantId: string): Promise<{ processed: number }> {
    const cfg = await this.integrations.getDecryptedConfig(tenantId, IntegrationType.TELEGRAM);
    if (!cfg) return { processed: 0 };
    if (!this.isPollingEligible(cfg)) return { processed: 0 };
    const token = String(cfg.botToken ?? "");
    const offset = Number(cfg.inboundOffset ?? 0);
    let processed = 0;
    let maxUpdateId = offset;
    try {
      const params = new URLSearchParams();
      params.set("timeout", "25");
      if (offset) params.set("offset", String(offset));
      const url = `https://api.telegram.org/bot${token}/getUpdates?${params.toString()}`;
      const res = await fetch(url);
      if (!res.ok) return { processed: 0 };
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        result?: TelegramUpdate[];
      };
      const updates = json.result ?? [];
      for (const u of updates) {
        try {
          await this.ingestTelegramUpdate(tenantId, u);
        } catch (err) {
          this.logger.warn(
            `Telegram update ingest failed for tenant ${tenantId} update ${u.update_id}: ${(err as Error).message}`,
          );
        }
        processed++;
        if (u.update_id >= maxUpdateId) maxUpdateId = u.update_id + 1;
      }
    } catch (err) {
      this.logger.warn(`Telegram getUpdates failed for tenant ${tenantId}: ${(err as Error).message}`);
      return { processed };
    }
    if (maxUpdateId !== offset) {
      await this.updateInboundOffset(tenantId, maxUpdateId);
    }
    return { processed };
  }

  /**
   * A tenant is eligible to poll when a bot token is configured AND the
   * admin has not explicitly disabled inbound or pointed the bot at a
   * webhook. Missing/empty/null inboundMode means "polling" (the safe
   * default — most local-network deployments can't accept a webhook).
   */
  private isPollingEligible(cfg: Record<string, unknown>): boolean {
    if (!cfg.botToken || String(cfg.botToken).trim() === "") return false;
    const mode = cfg.inboundMode == null ? "polling" : String(cfg.inboundMode);
    if (mode === "off") return false;
    if (mode === "webhook") return false;
    return true;
  }

  /**
   * Tick every tenant whose TELEGRAM integration is eligible for polling.
   * Used by the background interval started in onModuleInit.
   */
  async tickAllPollingTenants(): Promise<void> {
    const rows = await this.prisma.integration.findMany({
      where: { type: IntegrationType.TELEGRAM, deletedAt: null },
      select: { tenantId: true, config: true },
    });
    for (const row of rows) {
      // Eligibility uses the decrypted config so it sees the real botToken
      // value (the row's config has the secret in `_encrypted`). Re-resolve
      // once per row to keep the multi-tenant boundary clean.
      const decrypted = await this.integrations.getDecryptedConfig(
        row.tenantId,
        IntegrationType.TELEGRAM,
      );
      if (!decrypted || !this.isPollingEligible(decrypted)) continue;
      await this.tickTelegramPolling(row.tenantId).catch((err) => {
        this.logger.warn(
          `Telegram poll tick for tenant ${row.tenantId} failed: ${(err as Error).message}`,
        );
      });
    }
  }

  /**
   * Bump the saved inboundOffset on the TELEGRAM Integration. Done outside
   * the normal upsert flow because admins shouldn't have to touch this —
   * it's a server-managed cursor.
   */
  private async updateInboundOffset(tenantId: string, next: number): Promise<void> {
    const row = await this.prisma.integration.findFirst({
      where: { tenantId, type: IntegrationType.TELEGRAM, deletedAt: null },
    });
    if (!row) return;
    const current = (row.config as Prisma.JsonValue) as Record<string, unknown> | null;
    const newConfig = { ...(current ?? {}), inboundOffset: next };
    await this.prisma.integration.update({
      where: { id: row.id },
      data: { config: newConfig as unknown as Prisma.InputJsonValue },
    });
  }

  // ===== Webhook ingestion (called by Graph API, signed with X-Webhook-Secret) =====

  async ingestWebhook(tenantId: string, channel: string, dto: InboxWebhookDto) {
    const contact = await this.matchContact(tenantId, dto);
    const thread = await this.prisma.inboxThread.upsert({
      where: {
        tenantId_channel_externalThreadId: {
          tenantId,
          channel,
          externalThreadId: dto.externalThreadId,
        },
      },
      create: {
        tenantId,
        channel,
        externalThreadId: dto.externalThreadId,
        contactId: contact?.id ?? null,
        status: "OPEN",
        lastMessageAt: new Date(),
      },
      update: {
        contactId: contact?.id ?? null,
        status: "OPEN",
        lastMessageAt: new Date(),
      },
    });

    // Inbound customer message.
    const inbound = await this.prisma.inboxMessage.create({
      data: {
        tenantId,
        threadId: thread.id,
        direction: "INBOUND",
        sender: dto.senderName ?? "customer",
        text: dto.text,
        externalMessageId: dto.externalMessageId,
        status: "RECEIVED",
      },
    });

    // AI draft reply — flagged when sensitive categories are present so the
    // operator MUST review before sending. This is the M10 safety rail.
    const draftText = generateDraft(dto.text, channel);
    const sensitive = detectSensitiveCategories(`${dto.text}\n${draftText}`);
    const draftStatus = sensitive.length > 0 ? "NEEDS_REVIEW" : "DRAFT";
    const draft = await this.prisma.inboxMessage.create({
      data: {
        tenantId,
        threadId: thread.id,
        direction: "OUTBOUND",
        sender: "ai-draft",
        text: draftText,
        status: draftStatus,
        sensitiveCategories: sensitive,
      },
    });

    await this.audit.log({
      tenantId,
      action: "inbox.draft.created",
      entityType: "InboxMessage",
      entityId: draft.id,
      details: {
        threadId: thread.id,
        channel,
        sensitiveCategories: sensitive,
        autoSendBlocked: sensitive.length > 0,
      },
    });

    return { threadId: thread.id, inboundId: inbound.id, draft };
  }

  private async matchContact(tenantId: string, dto: InboxWebhookDto) {
    if (!dto.contactPhone) return null;
    const phone = (() => {
      try {
        return normalizePhone(dto.contactPhone);
      } catch {
        return null;
      }
    })();
    if (!phone) return null;
    return this.prisma.contact.findFirst({
      where: {
        tenantId,
        deletedAt: null,
        phones: { has: phone },
      },
    });
  }

  // ===== Operator review queue =====

  listThreads(query: ListThreadsQueryDto) {
    const { tenantId } = this.requireUser();
    return this.prisma.inboxThread.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(query.channel ? { channel: query.channel } : {}),
        ...(query.status && query.status !== "ALL" ? { status: query.status } : {}),
      },
      orderBy: { lastMessageAt: "desc" },
      include: {
        contact: { select: { id: true, fullName: true } },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { text: true, sender: true, status: true, direction: true, createdAt: true },
        },
      },
    });
  }

  async getThread(threadId: string) {
    const { tenantId } = this.requireUser();
    const thread = await this.prisma.inboxThread.findFirst({
      where: { id: threadId, tenantId, deletedAt: null },
      include: {
        contact: true,
        messages: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!thread) throw new NotFoundException("Thread not found");
    return thread;
  }

  /** Drafts awaiting any operator review across the tenant. */
  pendingDrafts() {
    const { tenantId } = this.requireUser();
    return this.prisma.inboxMessage.findMany({
      where: {
        tenantId,
        direction: "OUTBOUND",
        status: { in: ["DRAFT", "NEEDS_REVIEW"] },
      },
      orderBy: { createdAt: "asc" },
      take: 100,
    });
  }

  // ===== Approval workflow =====

  /**
   * Operator approves and sends the draft. Sensitive categories are no
   * blocker AT this step (operator has reviewed); they are only blocked
   * from auto-sending. Audit logs both the manual approval and the send.
   */
  async approveDraft(messageId: string, dto: ApproveDraftDto) {
    const { tenantId, userId } = this.requireUser();
    const msg = await this.prisma.inboxMessage.findFirst({
      where: { id: messageId, tenantId, direction: "OUTBOUND" },
    });
    if (!msg) throw new NotFoundException("Draft not found");
    if (!["DRAFT", "NEEDS_REVIEW"].includes(msg.status)) {
      throw new BadRequestException(`Cannot approve a message in status ${msg.status}`);
    }
    const finalText = dto.text ?? msg.text;
    // Sensitive content can be sent — but only by a human, never auto.
    // Re-detect after the operator's edit so re-introduced terms re-flag.
    const stillSensitive = detectSensitiveCategories(finalText);
    const thread = await this.prisma.inboxThread.findFirst({
      where: { id: msg.threadId, tenantId },
    });
    const externalMessageId = thread
      ? await this.dispatchToChannel(tenantId, thread, finalText)
      : null;
    const sent = await this.prisma.inboxMessage.update({
      where: { id: msg.id },
      data: {
        text: finalText,
        status: "SENT",
        sentAt: new Date(),
        approvedBy: userId,
        sensitiveCategories: stillSensitive,
        externalMessageId,
      },
    });
    await this.audit.log({
      tenantId,
      userId,
      action: "inbox.draft.approved",
      entityType: "InboxMessage",
      entityId: msg.id,
      details: { threadId: msg.threadId, sensitiveCategories: stillSensitive },
    });
    // (M11) Real Graph API send happens here. We mark SENT regardless so
    // the lifecycle is queryable; M11 deploy-hardening calls the API and
    // updates externalMessageId.
    return sent;
  }

  async rejectDraft(messageId: string, dto: RejectDraftDto) {
    const { tenantId, userId } = this.requireUser();
    const msg = await this.prisma.inboxMessage.findFirst({
      where: { id: messageId, tenantId, direction: "OUTBOUND" },
    });
    if (!msg) throw new NotFoundException("Draft not found");
    if (!["DRAFT", "NEEDS_REVIEW"].includes(msg.status)) {
      throw new BadRequestException(`Cannot reject a message in status ${msg.status}`);
    }
    const updated = await this.prisma.inboxMessage.update({
      where: { id: msg.id },
      data: {
        status: "REJECTED",
        approvedBy: userId,
        rejectionReason: dto.reason,
      },
    });
    await this.audit.log({
      tenantId,
      userId,
      action: "inbox.draft.rejected",
      entityType: "InboxMessage",
      entityId: msg.id,
      details: { threadId: msg.threadId, reason: dto.reason },
    });
    return updated;
  }

  /**
   * Operator manually sends a fresh message (no AI draft). Even fully
   * manual sends are sensitivity-tagged for audit completeness.
   */
  async sendManual(threadId: string, dto: SendManualMessageDto) {
    const { tenantId, userId, role } = this.requireUser();
    if (![UserRole.OPERATOR, UserRole.SUPERVISOR, UserRole.TENANT_ADMIN].includes(role)) {
      throw new ForbiddenException("Insufficient role to send messages");
    }
    const thread = await this.prisma.inboxThread.findFirst({
      where: { id: threadId, tenantId, deletedAt: null },
    });
    if (!thread) throw new NotFoundException("Thread not found");
    const sensitive = detectSensitiveCategories(dto.text);
    const externalMessageId = await this.dispatchToChannel(tenantId, thread, dto.text);
    const msg = await this.prisma.inboxMessage.create({
      data: {
        tenantId,
        threadId,
        direction: "OUTBOUND",
        sender: "operator",
        text: dto.text,
        status: "SENT",
        sentAt: new Date(),
        sensitiveCategories: sensitive,
        approvedBy: userId,
        externalMessageId,
      },
    });
    await this.prisma.inboxThread.update({
      where: { id: threadId },
      data: { lastMessageAt: new Date() },
    });
    await this.audit.log({
      tenantId,
      userId,
      action: "inbox.manual.sent",
      entityType: "InboxMessage",
      entityId: msg.id,
      details: { threadId, sensitiveCategories: sensitive },
    });
    return msg;
  }
}
