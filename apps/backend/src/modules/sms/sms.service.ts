import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  UnauthorizedException,
} from "@nestjs/common";
import { ClsService } from "nestjs-cls";
import { SOCKET_EVENTS, SmsStatus, IntegrationType } from "@acoustic-crm/shared";
import { readContext } from "../../common/tenant-context";
import { normalizePhone } from "../../common/phone";
import { PrismaService } from "../prisma/prisma.service";
import { RealtimeService } from "../realtime/realtime.service";
import { IntegrationsService } from "../integrations/integrations.service";
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

/**
 * Integration SMS config uses generic field names (login, password, apiKey,
 * sender). Each provider adapter expects its own names — translate here so the
 * saved credentials reach the right adapter fields.
 */
function mapSmsConfigToAdapter(
  provider: string,
  cfg: Record<string, unknown>,
): Record<string, unknown> {
  const login = cfg.login != null ? String(cfg.login) : undefined;
  const password = cfg.password != null ? String(cfg.password) : undefined;
  const apiKey = cfg.apiKey != null ? String(cfg.apiKey) : undefined;
  const sender = cfg.sender != null ? String(cfg.sender) : undefined;
  if (provider === "eskiz") {
    return { ...cfg, email: login, password, token: apiKey, from: sender };
  }
  if (provider === "playmobile") {
    return { ...cfg, login, password, originator: sender };
  }
  return { ...cfg };
}

@Injectable()
export class SmsService implements OnModuleInit {
  private readonly logger = new Logger(SmsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
    private readonly realtime: RealtimeService,
    private readonly adapters: SmsAdapterFactory,
    private readonly limiter: SmsRateLimiter,
    private readonly engine: TriggerEngine,
    private readonly integrations: IntegrationsService,
  ) {}

  /**
   * Resolve the provider + credentials this tenant should send with. Prefers
   * the saved SMS Integration row (decrypted); falls back to the legacy
   * Tenant.smsConfig only when no Integration is configured.
   */
  private async resolveSmsConfig(
    tenantId: string,
  ): Promise<{ provider: string | undefined; config: Record<string, unknown> }> {
    const integ = await this.integrations.getDecryptedConfig(tenantId, IntegrationType.SMS);
    if (integ) {
      const provider = integ.provider != null ? String(integ.provider) : undefined;
      return { provider, config: mapSmsConfigToAdapter(provider ?? "", integ) };
    }
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
      select: { smsConfig: true },
    });
    const cfg = (tenant?.smsConfig as TenantSmsConfig | null) ?? {};
    return { provider: cfg.provider, config: cfg as Record<string, unknown> };
  }

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

  // ===== Operator-facing settings =====

  /**
   * Tiny summary the SMS form needs to decide between template-only and free
   * text. Exposes only the public flags — credentials stay server-side.
   */
  async getOperatorSmsSettings(): Promise<{
    provider: string | null;
    allowFreeText: boolean;
    supportsTemplateSync: boolean;
  }> {
    const tenantId = this.currentTenantId();
    const { provider, config } = await this.resolveSmsConfig(tenantId);
    return {
      provider: provider ?? null,
      allowFreeText: config.allowFreeText === true || config.allowFreeText === "true",
      // Eskiz is currently the only adapter that implements fetchTemplates.
      supportsTemplateSync: provider ? !!this.adapters.pick(provider).fetchTemplates : false,
    };
  }

  // ===== Template sync from provider =====

  /**
   * Pull the tenant's pre-approved templates from the SMS provider (Eskiz
   * only, for now — Play Mobile does not expose this) and upsert them locally.
   * Used by the Settings "Sync templates" button. Idempotent: re-running
   * refreshes bodies/statuses without creating duplicates.
   */
  async syncTemplatesFromProvider(): Promise<{
    provider: string | null;
    fetched: number;
    upserted: number;
    skipped: number;
  }> {
    const tenantId = this.currentTenantId();
    const { provider, config } = await this.resolveSmsConfig(tenantId);
    if (!provider) throw new BadRequestException("SMS integratsiyasida provayder tanlanmagan");
    const adapter = this.adapters.pick(provider);
    if (!adapter.fetchTemplates) {
      throw new BadRequestException(
        `Provayder "${provider}" template ro'yxatini olishni qo'llamaydi`,
      );
    }
    const fetched = await adapter.fetchTemplates(config);
    let upserted = 0;
    let skipped = 0;
    for (const t of fetched) {
      if (!t.body || !t.externalId) {
        skipped++;
        continue;
      }
      // Auto-name keeps templates discoverable in dropdowns while avoiding
      // the (tenantId, name) unique collision when two templates share the
      // same body prefix.
      const preview = t.body.slice(0, 40).replace(/\s+/g, " ").trim();
      const name = `${preview} [${adapter.name} #${t.externalId}]`;
      try {
        await this.prisma.smsTemplate.upsert({
          where: {
            tenantId_externalProvider_externalId: {
              tenantId,
              externalProvider: adapter.name,
              externalId: t.externalId,
            },
          },
          create: {
            tenantId,
            name,
            body: t.body,
            externalProvider: adapter.name,
            externalId: t.externalId,
            externalStatus: t.status ?? null,
          },
          update: {
            body: t.body,
            externalStatus: t.status ?? null,
            // Reset soft-delete in case the operator removed-then-restored.
            deletedAt: null,
          },
        });
        upserted++;
      } catch (err) {
        this.logger.warn(
          `Failed to upsert template ${t.externalId}: ${(err as Error).message}`,
        );
        skipped++;
      }
    }
    return { provider, fetched: fetched.length, upserted, skipped };
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
      // Eskiz rejects messages whose text doesn't match an approved template
      // — let tenants opt in to free text only if they understand they'll
      // also need a provider that allows it (or a single approved template
      // they're paraphrasing). Default is template-only.
      const { config: smsCfg } = await this.resolveSmsConfig(tenantId);
      const allow = smsCfg.allowFreeText === true || smsCfg.allowFreeText === "true";
      if (!allow) {
        throw new ForbiddenException(
          "Erkin matn o'chirilgan (Eskiz faqat tasdiqlangan template'larga ruxsat beradi). Settings → SMS'da 'Erkin matn' ni yoqing yoki template tanlang.",
        );
      }
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
    const { provider, config } = await this.resolveSmsConfig(input.tenantId);
    const adapter = this.adapters.pick(provider);

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
