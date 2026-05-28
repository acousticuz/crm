import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { ClsService } from "nestjs-cls";
import { UserRole } from "@acoustic-crm/shared";
import { readContext } from "../../common/tenant-context";
import { normalizePhone } from "../../common/phone";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
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
export class InboxService {
  private readonly logger = new Logger(InboxService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
    private readonly audit: AuditService,
  ) {}

  private requireUser(): { userId: string; tenantId: string; role: UserRole } {
    const ctx = readContext(this.cls);
    if (!ctx.tenantId || !ctx.userId || !ctx.role) {
      throw new UnauthorizedException("Authentication required");
    }
    return { tenantId: ctx.tenantId, userId: ctx.userId, role: ctx.role };
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
    const sent = await this.prisma.inboxMessage.update({
      where: { id: msg.id },
      data: {
        text: finalText,
        status: "SENT",
        sentAt: new Date(),
        approvedBy: userId,
        sensitiveCategories: stillSensitive,
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
