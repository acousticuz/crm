import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CardStatus, StageType, TaskType, UserRole } from "@acoustic-crm/shared";
import { Prisma } from "@prisma/client";
import { normalizePhone, tryNormalizePhone } from "../../common/phone";
import { PrismaService } from "../prisma/prisma.service";

type AcousticLeadStatus =
  | "new_lead"
  | "visited_no_purchase"
  | "purchased"
  | "needs_follow_up";

interface AcousticLead {
  client_id: number;
  client_name?: string | null;
  phone_number?: string | null;
  call_center_order_id?: number | null;
  call_center_date?: string | null;
  call_center_created_at?: string | null;
  call_center_branch_id?: number | null;
  visited?: boolean;
  first_visit_date?: string | null;
  visit_branch_id?: number | null;
  visit_branch_name?: string | null;
  purchased?: boolean;
  purchase_date?: string | null;
  purchase_branch_id?: number | null;
  purchase_branch_name?: string | null;
  purchase_amount?: number | null;
  sale_id?: number | null;
  products?: Array<{
    product_ref_id?: number | null;
    product_name?: string | null;
    quantity?: number | null;
  }>;
  status: AcousticLeadStatus;
  next_action?: string | null;
}

interface AcousticPayload {
  data?: AcousticLead[];
  pagination?: { limit?: number; offset?: number; hasMore?: boolean };
}

interface SyncResult {
  dateFrom: string;
  dateTo: string;
  fetched: number;
  contactsUpdated: number;
  cardsUpdated: number;
  tasksCreated: number;
  skipped: number;
}

const DEFAULT_TZ_OFFSET_MINUTES = 5 * 60; // Uzbekistan time.

@Injectable()
export class AcousticSyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AcousticSyncService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === "test") return;
    if (this.config.get<string>("ACOUSTIC_SYNC_ENABLED", "false") !== "true") {
      this.logger.warn("Acoustic daily sync disabled: set ACOUSTIC_SYNC_ENABLED=true to enable");
      return;
    }
    if (!this.isConfigured()) {
      this.logger.warn("Acoustic daily sync disabled: ACOUSTIC_API_URL or ACOUSTIC_INTERNAL_API_KEY is missing");
      return;
    }
    this.scheduleNextRun();
  }

  onModuleDestroy(): void {
    if (this.timer) clearTimeout(this.timer);
  }

  async syncYesterday(): Promise<SyncResult> {
    const date = this.yesterdayIso();
    return this.syncRange({ dateFrom: date, dateTo: date });
  }

  async syncRange(input: { dateFrom: string; dateTo: string }): Promise<SyncResult> {
    if (this.running) {
      throw new Error("Acoustic sync is already running");
    }
    if (!this.isConfigured()) {
      throw new Error("ACOUSTIC_API_URL and ACOUSTIC_INTERNAL_API_KEY must be configured");
    }
    this.running = true;
    try {
      const tenants = await this.targetTenantIds();
      const leads = await this.fetchAll(input.dateFrom, input.dateTo);
      const result: SyncResult = {
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        fetched: leads.length,
        contactsUpdated: 0,
        cardsUpdated: 0,
        tasksCreated: 0,
        skipped: 0,
      };

      for (const tenantId of tenants) {
        for (const lead of leads) {
          try {
            const outcome = await this.applyLead(tenantId, lead);
            result.contactsUpdated += outcome.contactUpdated ? 1 : 0;
            result.cardsUpdated += outcome.cardUpdated ? 1 : 0;
            result.tasksCreated += outcome.taskCreated ? 1 : 0;
          } catch (err) {
            result.skipped++;
            this.logger.warn(
              `Failed to sync Acoustic lead ${lead.client_id} for tenant ${tenantId}: ${(err as Error).message}`,
            );
          }
        }
      }

      this.logger.log(
        `Acoustic sync ${input.dateFrom}..${input.dateTo}: fetched=${result.fetched}, contacts=${result.contactsUpdated}, cards=${result.cardsUpdated}, tasks=${result.tasksCreated}, skipped=${result.skipped}`,
      );
      return result;
    } finally {
      this.running = false;
    }
  }

  private async fetchAll(dateFrom: string, dateTo: string): Promise<AcousticLead[]> {
    const endpointUrl = this.leadsEndpointUrl();
    const token = this.config.get<string>("ACOUSTIC_INTERNAL_API_KEY", "");
    const limit = Math.min(Number(this.config.get<string>("ACOUSTIC_SYNC_LIMIT", "500")) || 500, 1000);
    let offset = 0;
    let hasMore = true;
    const out: AcousticLead[] = [];

    while (hasMore) {
      const url = new URL(endpointUrl);
      url.searchParams.set("dateFrom", dateFrom);
      url.searchParams.set("dateTo", dateTo);
      url.searchParams.set("syncMode", "activity");
      url.searchParams.set("limit", String(limit));
      url.searchParams.set("offset", String(offset));
      const branchIds = this.config.get<string>("ACOUSTIC_SYNC_BRANCH_IDS", "").trim();
      if (branchIds) url.searchParams.set("branchIds", branchIds);

      const res = await fetch(url, {
        headers: { "X-Internal-Key": token },
      });
      if (!res.ok) {
        throw new Error(`Acoustic API failed: ${res.status} ${await res.text()}`);
      }
      const payload = (await res.json().catch(() => ({}))) as AcousticPayload;
      out.push(...(payload.data ?? []));
      hasMore = payload.pagination?.hasMore === true;
      offset += limit;
    }
    return out;
  }

  private async applyLead(
    tenantId: string,
    lead: AcousticLead,
  ): Promise<{ contactUpdated: boolean; cardUpdated: boolean; taskCreated: boolean }> {
    const phone = tryNormalizePhone(lead.phone_number);
    const contact = await this.findOrCreateContact(tenantId, lead, phone);
    const card = await this.findOrCreateCard(tenantId, contact.id, lead);
    const branchId = await this.resolveBranchId(tenantId, lead);

    const acousticFields = this.acousticCustomFields(lead);
    await this.prisma.contact.update({
      where: { id: contact.id },
      data: {
        fullName: lead.client_name?.trim() || contact.fullName,
        phones: phone ? Array.from(new Set([...(contact.phones ?? []), phone])) : contact.phones,
        source: contact.source ?? "acoustic-api",
        customFields: {
          ...this.asObject(contact.customFields),
          acousticAnalytics: acousticFields,
        } as Prisma.InputJsonValue,
      },
    });

    let cardUpdated = false;
    if (card) {
      const desired = await this.cardUpdateForLead(tenantId, lead, branchId);
      await this.prisma.card.update({
        where: { id: card.id },
        data: {
          ...desired,
          budget:
            lead.purchase_amount != null
              ? new Prisma.Decimal(lead.purchase_amount)
              : card.budget,
        },
      });
      cardUpdated = true;
    }

    const taskCreated = await this.ensureFollowUpTask(tenantId, contact.id, card?.id ?? null, lead);
    if (lead.status === "purchased") {
      await this.completeAcousticFollowUpTasks(tenantId, contact.id, card?.id ?? null, lead);
    }
    return { contactUpdated: true, cardUpdated, taskCreated };
  }

  private async findOrCreateContact(
    tenantId: string,
    lead: AcousticLead,
    phone: string | null,
  ) {
    const byClientId = await this.prisma.contact.findFirst({
      where: {
        tenantId,
        deletedAt: null,
        customFields: { path: ["acousticAnalytics", "clientId"], equals: lead.client_id },
      },
    });
    if (byClientId) return byClientId;

    if (phone) {
      const byPhone = await this.prisma.contact.findFirst({
        where: { tenantId, deletedAt: null, phones: { has: phone } },
      });
      if (byPhone) return byPhone;
    }

    return this.prisma.contact.create({
      data: {
        tenantId,
        fullName: lead.client_name?.trim() || "Acoustic lead",
        phones: phone ? [phone] : [],
        source: "acoustic-api",
        customFields: {
          acousticAnalytics: this.acousticCustomFields(lead),
        } as Prisma.InputJsonValue,
      },
    });
  }

  private async findOrCreateCard(tenantId: string, contactId: string, lead: AcousticLead) {
    const existing = await this.prisma.card.findFirst({
      where: { tenantId, contactId, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
    if (existing) return existing;

    const pipeline = await this.prisma.pipeline.findFirst({
      where: { tenantId, deletedAt: null, isDefault: true },
    });
    if (!pipeline) return null;
    const stage =
      (lead.status === "purchased"
        ? await this.prisma.stage.findFirst({
            where: { tenantId, pipelineId: pipeline.id, type: StageType.WON, deletedAt: null },
            orderBy: { order: "asc" },
          })
        : null) ??
      (await this.prisma.stage.findFirst({
        where: { tenantId, pipelineId: pipeline.id, type: StageType.NORMAL, deletedAt: null },
        orderBy: { order: "asc" },
      }));
    if (!stage) return null;

    return this.prisma.card.create({
      data: {
        tenantId,
        pipelineId: pipeline.id,
        stageId: stage.id,
        contactId,
        title: lead.client_name?.trim() || `Acoustic lead #${lead.client_id}`,
        budget:
          lead.purchase_amount != null ? new Prisma.Decimal(lead.purchase_amount) : null,
        status: stage.type === StageType.WON ? CardStatus.WON : CardStatus.OPEN,
        enteredStageAt: new Date(),
      },
    });
  }

  private async cardUpdateForLead(
    tenantId: string,
    lead: AcousticLead,
    branchId: string | null,
  ): Promise<Prisma.CardUpdateInput> {
    const data: Prisma.CardUpdateInput = {};
    if (branchId) data.branch = { connect: { id: branchId } };
    if (lead.status === "purchased") {
      data.status = CardStatus.WON;
      const wonStage = await this.prisma.stage.findFirst({
        where: { tenantId, type: StageType.WON, deletedAt: null },
        orderBy: { order: "asc" },
      });
      if (wonStage) {
        data.stage = { connect: { id: wonStage.id } };
        data.pipeline = { connect: { id: wonStage.pipelineId } };
        data.enteredStageAt = new Date();
      }
    } else {
      data.status = CardStatus.OPEN;
    }
    return data;
  }

  private async resolveBranchId(tenantId: string, lead: AcousticLead): Promise<string | null> {
    const name = lead.purchase_branch_name ?? lead.visit_branch_name;
    const externalId = this.acousticBranchId(lead);
    if (externalId) {
      const byId = await this.prisma.branch.findFirst({
        where: { id: externalId, tenantId, deletedAt: null },
      });
      if (byId) return byId.id;
    }
    if (!name?.trim()) return null;
    const existing = await this.prisma.branch.findFirst({
      where: { tenantId, deletedAt: null, name: name.trim() },
    });
    if (existing) return existing.id;
    const idAvailable =
      externalId && !(await this.prisma.branch.findUnique({ where: { id: externalId } }));
    const created = await this.prisma.branch.create({
      data: { ...(idAvailable ? { id: externalId } : {}), tenantId, name: name.trim() },
    });
    return created.id;
  }

  private acousticBranchId(lead: AcousticLead): string | null {
    const raw = lead.purchase_branch_id ?? lead.visit_branch_id ?? lead.call_center_branch_id;
    if (raw == null || raw <= 0) return null;
    return String(raw);
  }

  private async ensureFollowUpTask(
    tenantId: string,
    contactId: string,
    cardId: string | null,
    lead: AcousticLead,
  ): Promise<boolean> {
    if (!["needs_follow_up", "visited_no_purchase"].includes(lead.status)) return false;
    const assigneeId = await this.resolveAssigneeId(tenantId, contactId, cardId);
    if (!assigneeId) return false;
    const marker = this.taskMarker(lead);
    const existing = await this.prisma.task.findFirst({
      where: {
        tenantId,
        deletedAt: null,
        completedAt: null,
        OR: [{ contactId }, ...(cardId ? [{ cardId }] : [])],
        text: { contains: marker },
      },
    });
    if (existing) return false;

    await this.prisma.task.create({
      data: {
        tenantId,
        contactId,
        cardId,
        assigneeId,
        type: TaskType.FOLLOWUP,
        text: `${this.followUpText(lead)} ${marker}`,
        dueAt: this.todayAtTargetHour(10),
      },
    });
    return true;
  }

  private async completeAcousticFollowUpTasks(
    tenantId: string,
    contactId: string,
    cardId: string | null,
    lead: AcousticLead,
  ): Promise<void> {
    await this.prisma.task.updateMany({
      where: {
        tenantId,
        deletedAt: null,
        completedAt: null,
        OR: [{ contactId }, ...(cardId ? [{ cardId }] : [])],
        text: { contains: `[Acoustic:${lead.client_id}:` },
      },
      data: {
        completedAt: new Date(),
        result: "Acoustic sync: client purchased",
      },
    });
  }

  private async resolveAssigneeId(
    tenantId: string,
    contactId: string,
    cardId: string | null,
  ): Promise<string | null> {
    if (cardId) {
      const card = await this.prisma.card.findFirst({
        where: { id: cardId, tenantId },
        select: { responsibleUserId: true },
      });
      if (card?.responsibleUserId) return card.responsibleUserId;
    }
    const contact = await this.prisma.contact.findFirst({
      where: { id: contactId, tenantId },
      select: { responsibleUserId: true },
    });
    if (contact?.responsibleUserId) return contact.responsibleUserId;
    const user = await this.prisma.user.findFirst({
      where: {
        tenantId,
        deletedAt: null,
        status: "ACTIVE",
        role: { in: [UserRole.OPERATOR, UserRole.SUPERVISOR, UserRole.TENANT_ADMIN] },
      },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    return user?.id ?? null;
  }

  private acousticCustomFields(lead: AcousticLead): Record<string, unknown> {
    return {
      clientId: lead.client_id,
      clientName: lead.client_name ?? null,
      phoneNumber: lead.phone_number ?? null,
      callCenterOrderId: lead.call_center_order_id ?? null,
      callCenterDate: lead.call_center_date ?? null,
      callCenterCreatedAt: lead.call_center_created_at ?? null,
      callCenterBranchId: lead.call_center_branch_id ?? null,
      visited: lead.visited === true,
      firstVisitDate: lead.first_visit_date ?? null,
      visitBranchId: lead.visit_branch_id ?? null,
      visitBranchName: lead.visit_branch_name ?? null,
      purchased: lead.purchased === true,
      purchaseDate: lead.purchase_date ?? null,
      purchaseBranchId: lead.purchase_branch_id ?? null,
      purchaseBranchName: lead.purchase_branch_name ?? null,
      purchaseAmount: lead.purchase_amount ?? null,
      saleId: lead.sale_id ?? null,
      products: lead.products ?? [],
      status: lead.status,
      nextAction: lead.next_action ?? null,
      syncedAt: new Date().toISOString(),
    };
  }

  private followUpText(lead: AcousticLead): string {
    if (lead.status === "visited_no_purchase") {
      return `Filialga borgan, xarid qilmagan mijoz bilan bog'laning: ${lead.client_name ?? lead.phone_number ?? lead.client_id}.`;
    }
    return `Acoustic lead bo'yicha qayta qo'ng'iroq qiling: ${lead.client_name ?? lead.phone_number ?? lead.client_id}.`;
  }

  private taskMarker(lead: AcousticLead): string {
    return `[Acoustic:${lead.client_id}:${lead.status}]`;
  }

  private asObject(value: Prisma.JsonValue | null): Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private async targetTenantIds(): Promise<string[]> {
    const configured = this.config.get<string>("ACOUSTIC_SYNC_TENANT_IDS", "").trim();
    if (configured) {
      return configured.split(",").map((x) => x.trim()).filter(Boolean);
    }
    const tenants = await this.prisma.tenant.findMany({
      where: { deletedAt: null, status: "ACTIVE" },
      select: { id: true },
    });
    return tenants.map((t) => t.id);
  }

  private isConfigured(): boolean {
    return Boolean(
      this.config.get<string>("ACOUSTIC_API_URL") &&
        this.config.get<string>("ACOUSTIC_INTERNAL_API_KEY"),
    );
  }

  private leadsEndpointUrl(): string {
    const configured = this.config.get<string>("ACOUSTIC_API_URL", "").replace(/\/$/, "");
    if (/\/v1\/clients\/call-center-leads$/i.test(configured)) {
      return configured;
    }
    return `${configured}/v1/clients/call-center-leads`;
  }

  private scheduleNextRun(): void {
    const delay = this.msUntilNextRun();
    this.timer = setTimeout(() => {
      this.syncYesterday()
        .catch((err) => this.logger.error(`Acoustic daily sync failed: ${(err as Error).message}`))
        .finally(() => this.scheduleNextRun());
    }, delay);
    this.logger.log(`Acoustic daily sync scheduled in ${Math.round(delay / 1000)}s`);
  }

  private msUntilNextRun(): number {
    const hour = Number(this.config.get<string>("ACOUSTIC_SYNC_HOUR", "5")) || 5;
    const now = new Date();
    const offsetMs = this.tzOffsetMinutes() * 60_000;
    const targetNow = new Date(now.getTime() + offsetMs);
    const nextTarget = new Date(targetNow);
    nextTarget.setUTCHours(hour, 0, 0, 0);
    if (nextTarget.getTime() <= targetNow.getTime()) {
      nextTarget.setUTCDate(nextTarget.getUTCDate() + 1);
    }
    return nextTarget.getTime() - targetNow.getTime();
  }

  private yesterdayIso(): string {
    const offsetMs = this.tzOffsetMinutes() * 60_000;
    const targetNow = new Date(Date.now() + offsetMs);
    targetNow.setUTCDate(targetNow.getUTCDate() - 1);
    return targetNow.toISOString().slice(0, 10);
  }

  private todayAtTargetHour(hour: number): Date {
    const offsetMs = this.tzOffsetMinutes() * 60_000;
    const targetNow = new Date(Date.now() + offsetMs);
    targetNow.setUTCHours(hour, 0, 0, 0);
    return new Date(targetNow.getTime() - offsetMs);
  }

  private tzOffsetMinutes(): number {
    return (
      Number(this.config.get<string>("ACOUSTIC_SYNC_TZ_OFFSET_MINUTES", "")) ||
      DEFAULT_TZ_OFFSET_MINUTES
    );
  }
}
