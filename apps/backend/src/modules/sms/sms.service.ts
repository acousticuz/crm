import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  OnModuleInit,
  UnauthorizedException,
} from "@nestjs/common";
import { ClsService } from "nestjs-cls";
import { SOCKET_EVENTS, SmsStatus } from "@acoustic-crm/shared";
import { readContext } from "../../common/tenant-context";
import { normalizePhone } from "../../common/phone";
import { PrismaService } from "../prisma/prisma.service";
import { RealtimeService } from "../realtime/realtime.service";
import { TriggerEngine } from "../triggers/trigger.engine";
import { SmsAdapterFactory } from "./sms-adapter.factory";
import { SmsRateLimiter } from "./rate-limiter";
import { interpolate } from "./template";
import { CreateSmsTemplateDto, SendSmsDto, UpdateSmsTemplateDto } from "./dto/sms.dto";

interface TenantSmsConfig {
  provider?: string;
  // Provider-specific credentials (token, login/password, originator, etc.)
  [k: string]: unknown;
}

// Nest doesn't ship a 429 exception class out of the box — define one locally.
export class TooManyRequestsException extends HttpException {
  constructor(message: string) {
    super(message, HttpStatus.TOO_MANY_REQUESTS);
  }
}

// Prisma's generated SmsStatus type and the shared enum have the same string
// values but TS treats them as nominally distinct. Small bridge to convert.
function toShared(s: string): SmsStatus {
  return s as SmsStatus;
}

@Injectable()
export class SmsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
    private readonly realtime: RealtimeService,
    private readonly adapters: SmsAdapterFactory,
    private readonly limiter: SmsRateLimiter,
    private readonly engine: TriggerEngine,
  ) {}

  /**
   * Register ourselves with the trigger engine so the `sms` trigger action
   * routes through here. Done on module init to avoid a circular import
   * between SmsModule and TriggersModule.
   */
  onModuleInit(): void {
    this.engine.registerSmsHandler({
      sendFromTrigger: async (input) => this.sendFromTrigger(input),
    });
  }

  private currentTenantId(): string {
    const tid = readContext(this.cls).tenantId;
    if (!tid) throw new UnauthorizedException("No tenant context");
    return tid;
  }

  // ===== Templates CRUD =====

  async createTemplate(dto: CreateSmsTemplateDto) {
    const tenantId = this.currentTenantId();
    try {
      return await this.prisma.t.smsTemplate.create({
        data: { tenantId, name: dto.name, body: dto.body },
      });
    } catch (err) {
      if ((err as { code?: string }).code === "P2002") {
        throw new ConflictException(`SMS template "${dto.name}" already exists`);
      }
      throw err;
    }
  }

  listTemplates() {
    return this.prisma.t.smsTemplate.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
    });
  }

  async findTemplate(id: string) {
    const t = await this.prisma.t.smsTemplate.findFirst({
      where: { id, deletedAt: null },
    });
    if (!t) throw new NotFoundException("Template not found");
    return t;
  }

  async updateTemplate(id: string, dto: UpdateSmsTemplateDto) {
    await this.findTemplate(id);
    return this.prisma.t.smsTemplate.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.body !== undefined ? { body: dto.body } : {}),
      },
    });
  }

  async deleteTemplate(id: string): Promise<{ id: string }> {
    await this.findTemplate(id);
    await this.prisma.t.smsTemplate.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { id };
  }

  // ===== Manual + trigger send =====

  async sendManual(dto: SendSmsDto) {
    const tenantId = this.currentTenantId();
    const phone = normalizePhone(dto.phone);
    let body: string;
    let templateId: string | null = null;
    const vars = dto.variables ?? {};
    if (dto.templateId) {
      const template = await this.findTemplate(dto.templateId);
      body = interpolate(template.body, vars);
      templateId = template.id;
    } else if (dto.text) {
      body = interpolate(dto.text, vars);
    } else {
      throw new BadRequestException("Either templateId or text is required");
    }
    return this.deliver({
      tenantId,
      phone,
      body,
      cardId: dto.cardId ?? null,
      contactId: dto.contactId ?? null,
      templateId,
    });
  }

  async sendFromTrigger(input: {
    tenantId: string;
    cardId?: string;
    contactId?: string;
    templateId?: string;
    text?: string;
  }) {
    // Triggers run outside the request context — load card/contact via base
    // prisma so we can resolve recipient phone + variables.
    const card = input.cardId
      ? await this.prisma.card.findFirst({
          where: { id: input.cardId, tenantId: input.tenantId, deletedAt: null },
          include: { contact: true },
        })
      : null;
    const contact = card?.contact
      ?? (input.contactId
        ? await this.prisma.contact.findFirst({
            where: { id: input.contactId, tenantId: input.tenantId, deletedAt: null },
          })
        : null);
    if (!contact || contact.phones.length === 0) {
      return null; // Nothing to send to — fail soft.
    }
    const phone = normalizePhone(contact.phones[0]);
    const vars: Record<string, string | number> = {
      ism: contact.fullName,
      phone,
      sana: new Date().toLocaleDateString("uz-UZ"),
      summa: card?.budget ? String(card.budget) : "",
      budget: card?.budget ? String(card.budget) : "",
    };
    let body: string;
    let templateId: string | null = null;
    if (input.templateId) {
      const template = await this.prisma.smsTemplate.findFirst({
        where: { id: input.templateId, tenantId: input.tenantId, deletedAt: null },
      });
      if (!template) return null;
      body = interpolate(template.body, vars);
      templateId = template.id;
    } else if (input.text) {
      body = interpolate(input.text, vars);
    } else {
      return null;
    }
    return this.deliver({
      tenantId: input.tenantId,
      phone,
      body,
      cardId: input.cardId ?? null,
      contactId: contact.id,
      templateId,
    });
  }

  private async deliver(input: {
    tenantId: string;
    phone: string;
    body: string;
    cardId: string | null;
    contactId: string | null;
    templateId: string | null;
  }) {
    if (!this.limiter.check(input.tenantId, input.phone)) {
      throw new TooManyRequestsException(
        "SMS rate limit reached for this phone number; try again shortly",
      );
    }
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: input.tenantId, deletedAt: null },
      select: { smsConfig: true },
    });
    const config = (tenant?.smsConfig as TenantSmsConfig | null) ?? {};
    const adapter = this.adapters.pick(config.provider);

    // Insert as QUEUED first so we always have a record even if the adapter
    // crashes the process partway.
    const log = await this.prisma.smsLog.create({
      data: {
        tenantId: input.tenantId,
        contactId: input.contactId,
        cardId: input.cardId,
        templateId: input.templateId,
        phone: input.phone,
        text: input.body,
        provider: adapter.name,
        status: SmsStatus.QUEUED,
      },
    });

    const result = await adapter.send(
      { phone: input.phone, text: input.body },
      config as Record<string, unknown>,
    );
    const updated = await this.prisma.smsLog.update({
      where: { id: log.id },
      data: {
        status: result.status,
        providerMessageId: result.providerMessageId,
        errorMessage: result.errorMessage ?? null,
        sentAt: result.status === SmsStatus.SENT ? new Date() : null,
      },
    });
    this.realtime.toTenant(input.tenantId, SOCKET_EVENTS.SMS_STATUS, { smsLog: updated });
    return updated;
  }

  // ===== Delivery webhook (provider → us) =====

  /**
   * Generic webhook payload digester. Eskiz/Play Mobile both POST a status
   * update referencing the provider's message id. We look the log up by
   * provider+providerMessageId and flip status accordingly.
   */
  async handleWebhook(
    tenantId: string,
    provider: string,
    payload: Record<string, unknown>,
  ) {
    const messageId =
      (payload.message_id as string | undefined) ??
      (payload.id as string | undefined) ??
      (payload.providerMessageId as string | undefined);
    const status = String(payload.status ?? "").toUpperCase();
    if (!messageId) {
      throw new BadRequestException("Webhook payload missing message id");
    }
    const log = await this.prisma.smsLog.findFirst({
      where: { tenantId, provider, providerMessageId: messageId },
    });
    if (!log) {
      throw new NotFoundException("SMS log not found for this provider message id");
    }
    let next: SmsStatus = toShared(log.status);
    if (status === "DELIVERED" || status === "DELIVRD") next = SmsStatus.DELIVERED;
    else if (status === "FAILED" || status === "EXPIRED" || status === "REJECTED") next = SmsStatus.FAILED;
    else if (status === "SENT" || status === "ENROUTE") next = SmsStatus.SENT;
    const updated = await this.prisma.smsLog.update({
      where: { id: log.id },
      data: {
        status: next,
        deliveredAt: next === SmsStatus.DELIVERED ? new Date() : log.deliveredAt,
        errorMessage:
          next === SmsStatus.FAILED
            ? String(payload.error ?? payload.message ?? "Provider reported failure")
            : log.errorMessage,
      },
    });
    this.realtime.toTenant(tenantId, SOCKET_EVENTS.SMS_STATUS, { smsLog: updated });
    return updated;
  }

  // ===== Listing =====

  listByCard(cardId: string) {
    return this.prisma.t.smsLog.findMany({
      where: { cardId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  listByContact(contactId: string) {
    return this.prisma.t.smsLog.findMany({
      where: { contactId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }
}
