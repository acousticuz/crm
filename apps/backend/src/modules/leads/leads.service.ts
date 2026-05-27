import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { ClsService } from "nestjs-cls";
import { LeadStatus } from "@acoustic-crm/shared";
import { readContext } from "../../common/tenant-context";
import { PrismaService } from "../prisma/prisma.service";
import { ContactsService } from "../contacts/contacts.service";
import { LeadWebhookDto } from "./dto/lead-webhook.dto";
import { FindLeadsDto } from "./dto/find-leads.dto";

const DEFAULT_PAGE_SIZE = 20;

/**
 * Distribution rule shape we look up under Tenant.settings.leadDistribution:
 *   {
 *     defaultPipelineId?: string,
 *     defaultResponsibleUserId?: string,
 *     sourceRules?: [{ source, pipelineId?, responsibleUserId? }]
 *   }
 * Missing settings fall back to the tenant's default Pipeline + first NORMAL
 * stage with no responsible user assigned.
 */
interface DistributionRule {
  pipelineId?: string;
  responsibleUserId?: string;
}

interface DistributionSettings {
  defaultPipelineId?: string;
  defaultResponsibleUserId?: string;
  sourceRules?: Array<{ source: string } & DistributionRule>;
}

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contacts: ContactsService,
    private readonly cls: ClsService,
  ) {}

  private currentTenantId(): string {
    const tid = readContext(this.cls).tenantId;
    if (!tid) throw new UnauthorizedException("No tenant context");
    return tid;
  }

  /** Public entrypoint from a webhook. CLS scope is already set by WebhookGuard. */
  async createFromWebhook(source: string, dto: LeadWebhookDto, rawBody: unknown) {
    const tenantId = this.currentTenantId();
    return this.prisma.t.lead.create({
      data: {
        tenantId,
        source,
        rawData: (rawBody ?? {}) as Prisma.JsonObject,
        status: LeadStatus.UNSORTED,
      },
    });
  }

  list(query: FindLeadsDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const where: Prisma.LeadWhereInput = { deletedAt: null };
    if (query.status) where.status = query.status;
    if (query.source) where.source = query.source;
    return Promise.all([
      this.prisma.t.lead.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.t.lead.count({ where }),
    ]).then(([items, total]) => ({ items, total, page, pageSize }));
  }

  unsorted(query: FindLeadsDto) {
    return this.list({ ...query, status: LeadStatus.UNSORTED });
  }

  async findById(id: string) {
    const lead = await this.prisma.t.lead.findFirst({
      where: { id, deletedAt: null },
    });
    if (!lead) throw new NotFoundException("Lead not found");
    return lead;
  }

  /**
   * Accept a lead: ensure a Contact exists for the lead's phone, pick the
   * pipeline+stage per distribution rules, create a Card, link the Lead.
   */
  async accept(id: string) {
    const lead = await this.findById(id);
    if (lead.status !== LeadStatus.UNSORTED) {
      throw new BadRequestException(`Lead is already ${lead.status}`);
    }
    const tenantId = this.currentTenantId();
    const raw = lead.rawData as Record<string, unknown> | null;
    const fullName = String(raw?.fullName ?? "Unnamed lead");
    const phoneStr = raw?.phone;
    if (typeof phoneStr !== "string") {
      throw new BadRequestException("Lead rawData lacks a usable phone");
    }

    const contact = await this.contacts.findOrCreateByPhone({
      fullName,
      phone: phoneStr,
      source: lead.source,
    });
    if (!contact) {
      throw new BadRequestException("Failed to resolve contact for lead");
    }

    const rule = await this.pickDistributionRule(tenantId, lead.source);
    const { pipelineId, stageId, responsibleUserId } = await this.resolvePlacement(rule);

    const card = await this.prisma.t.card.create({
      data: {
        tenantId,
        pipelineId,
        stageId,
        contactId: contact.id,
        title: fullName,
        responsibleUserId: responsibleUserId ?? null,
        status: "OPEN",
        enteredStageAt: new Date(),
      },
    });

    await this.prisma.t.lead.update({
      where: { id: lead.id },
      data: {
        status: LeadStatus.ACCEPTED,
        contactId: contact.id,
        cardId: card.id,
      },
    });

    return { leadId: lead.id, contactId: contact.id, cardId: card.id };
  }

  async reject(id: string) {
    const lead = await this.findById(id);
    if (lead.status !== LeadStatus.UNSORTED) {
      throw new BadRequestException(`Lead is already ${lead.status}`);
    }
    await this.prisma.t.lead.update({
      where: { id: lead.id },
      data: { status: LeadStatus.REJECTED },
    });
    return { leadId: lead.id, status: LeadStatus.REJECTED };
  }

  private async pickDistributionRule(
    tenantId: string,
    source: string,
  ): Promise<DistributionRule> {
    // Tenant model is not tenant-scoped, but we still scope to active rows.
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
      select: { settings: true },
    });
    const settings = (tenant?.settings as Record<string, unknown> | null) ?? null;
    const dist = settings?.leadDistribution as DistributionSettings | undefined;
    const matched = dist?.sourceRules?.find((r) => r.source === source);
    return {
      pipelineId: matched?.pipelineId ?? dist?.defaultPipelineId,
      responsibleUserId: matched?.responsibleUserId ?? dist?.defaultResponsibleUserId,
    };
  }

  private async resolvePlacement(rule: DistributionRule) {
    // Pipeline: explicit from rule, else tenant's default Pipeline.
    let pipeline = rule.pipelineId
      ? await this.prisma.t.pipeline.findFirst({
          where: { id: rule.pipelineId, deletedAt: null },
        })
      : await this.prisma.t.pipeline.findFirst({
          where: { isDefault: true, deletedAt: null },
        });
    if (!pipeline) {
      // Fallback: any pipeline in tenant — picks the first one (defensively).
      pipeline = await this.prisma.t.pipeline.findFirst({ where: { deletedAt: null } });
    }
    if (!pipeline) {
      throw new BadRequestException(
        "Tenant has no pipeline configured; cannot place lead Card",
      );
    }
    const stage = await this.prisma.t.stage.findFirst({
      where: { pipelineId: pipeline.id, type: "NORMAL", deletedAt: null },
      orderBy: { order: "asc" },
    });
    if (!stage) {
      throw new BadRequestException("Pipeline has no NORMAL stage; cannot place lead Card");
    }
    return {
      pipelineId: pipeline.id,
      stageId: stage.id,
      responsibleUserId: rule.responsibleUserId,
    };
  }
}
