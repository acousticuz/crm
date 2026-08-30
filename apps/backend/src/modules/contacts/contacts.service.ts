import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { ClsService } from "nestjs-cls";
import { readContext } from "../../common/tenant-context";
import { normalizePhones } from "../../common/phone";
import { PrismaService } from "../prisma/prisma.service";
import { CreateContactDto } from "./dto/create-contact.dto";
import { UpdateContactDto } from "./dto/update-contact.dto";
import { FindAcousticClientsDto, FindAcousticPurchasesDto, FindContactsDto } from "./dto/find-contacts.dto";

const DEFAULT_PAGE_SIZE = 20;

interface AcousticLead {
  client_id: number;
  client_name?: string | null;
  phone_number?: string | null;
  call_center_date?: string | null;
  first_visit_date?: string | null;
  visit_branch_id?: number | null;
  visit_branch_name?: string | null;
  purchased?: boolean;
  purchase_date?: string | null;
  purchase_branch_id?: number | null;
  purchase_branch_name?: string | null;
  purchase_amount?: number | null;
  products?: Array<{
    product_ref_id?: number | null;
    product_name?: string | null;
    quantity?: number | null;
  }>;
  status?: string;
  next_action?: string | null;
}

interface AcousticLeadPayload {
  data?: AcousticLead[];
  pagination?: { total?: number; limit?: number; offset?: number; hasMore?: boolean };
}


@Injectable()
export class ContactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
    private readonly config: ConfigService,
  ) {}

  private currentTenantId(): string {
    const tid = readContext(this.cls).tenantId;
    if (!tid) throw new UnauthorizedException("No tenant context");
    return tid;
  }

  async create(dto: CreateContactDto) {
    const tenantId = this.currentTenantId();
    const phones = normalizePhones(dto.phones);
    if (phones.length === 0) {
      throw new ConflictException("At least one phone number is required");
    }
    const dup = await this.findByPhones(phones);
    if (dup.length > 0) {
      throw new ConflictException({
        message: "Contact with one of these phones already exists",
        duplicates: dup.map((c) => ({ id: c.id, fullName: c.fullName, phones: c.phones })),
      });
    }
    return this.prisma.t.contact.create({
      data: {
        tenantId,
        fullName: dto.fullName,
        phones,
        email: dto.email ?? null,
        source: dto.source ?? null,
        responsibleUserId: dto.responsibleUserId ?? null,
      },
    });
  }

  /**
   * List contacts with search and filters. Search matches fullName (ILIKE)
   * or any phone substring. Pagination is offset-based.
   */
  async list(query: FindContactsDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const where: Prisma.ContactWhereInput = { deletedAt: null };
    if (query.source) where.source = query.source;
    if (query.responsibleUserId) where.responsibleUserId = query.responsibleUserId;
    if (query.q) {
      const normalized = (() => {
        try {
          return normalizePhones([query.q])[0];
        } catch {
          return null;
        }
      })();
      where.OR = [
        { fullName: { contains: query.q, mode: "insensitive" } },
        // Postgres ARRAY contains exact match — best effort for phone search.
        ...(normalized ? [{ phones: { has: normalized } }] : []),
        { phones: { hasSome: [query.q] } },
      ];
    }
    const [items, total] = await Promise.all([
      this.prisma.t.contact.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.t.contact.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async listAcousticPurchases(query: FindAcousticPurchasesDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const today = new Date();
    const fallbackTo = today.toISOString().slice(0, 10);
    const from = new Date(today);
    from.setUTCDate(from.getUTCDate() - 30);
    const fallbackFrom = from.toISOString().slice(0, 10);
    const dateFrom = query.dateFrom ?? fallbackFrom;
    const dateTo = query.dateTo ?? fallbackTo;

    const base = this.config.get<string>("ACOUSTIC_API_URL", "").replace(/\/$/, "");
    const token = this.config.get<string>("ACOUSTIC_INTERNAL_API_KEY", "");
    if (!base || !token) {
      return { items: [], total: 0, page, pageSize };
    }

    const endpoint = /\/v1\/clients\/call-center-leads$/i.test(base)
      ? base
      : `${base}/v1/clients/call-center-leads`;
    const url = new URL(endpoint);
    url.searchParams.set("dateFrom", dateFrom);
    url.searchParams.set("dateTo", dateTo);
    url.searchParams.set("syncMode", "activity");
    url.searchParams.set("status", "purchased");
    url.searchParams.set("limit", String(pageSize));
    url.searchParams.set("offset", String((page - 1) * pageSize));
    if (query.branchIds?.trim()) url.searchParams.set("branchIds", query.branchIds.trim());

    const res = await fetch(url, { headers: { "X-Internal-Key": token } });
    if (!res.ok) {
      throw new Error(`Acoustic API failed: ${res.status} ${await res.text()}`);
    }
    const payload = (await res.json().catch(() => ({}))) as AcousticLeadPayload;
    const allItems = payload.data ?? [];
    const q = query.q?.trim().toLowerCase();
    const filtered = q
      ? allItems.filter((lead) => {
          const name = lead.client_name?.toLowerCase() ?? "";
          const phone = lead.phone_number ?? "";
          return name.includes(q) || phone.includes(q);
        })
      : allItems;

    return {
      items: filtered.map((lead) => ({
        id: `acoustic-${lead.client_id}`,
        fullName: lead.client_name?.trim() || "Noma'lum",
        phones: lead.phone_number ? [lead.phone_number] : [],
        source: "acoustic-live",
        responsible: null,
        createdAt: lead.call_center_date ?? lead.purchase_date ?? new Date().toISOString(),
        updatedAt: lead.purchase_date ?? lead.call_center_date ?? new Date().toISOString(),
        acoustic: {
          clientId: lead.client_id,
          status: lead.status ?? "purchased",
          nextAction: lead.next_action ?? null,
          visited: Boolean(lead.first_visit_date),
          purchased: true,
          purchaseAmount: lead.purchase_amount ?? null,
          callCenterDate: lead.call_center_date ?? null,
          firstVisitDate: lead.first_visit_date ?? null,
          visitBranchId: lead.visit_branch_id ?? null,
          visitBranchName: lead.visit_branch_name ?? null,
          purchaseBranchId: lead.purchase_branch_id ?? null,
          purchaseBranchName: lead.purchase_branch_name ?? null,
          purchaseDate: lead.purchase_date ?? null,
          products: lead.products ?? [],
        },
        card: null,
      })),
      total: q ? filtered.length : (payload.pagination?.total ?? filtered.length),
      page,
      pageSize,
    };
  }

  async listAcousticClients(query: FindAcousticClientsDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const where: Prisma.ContactWhereInput = {
      deletedAt: null,
      source: "acoustic-api",
    };
    if (query.responsibleUserId) where.responsibleUserId = query.responsibleUserId;
    if (query.status) {
      where.customFields = {
        path: ["acousticAnalytics", "status"],
        equals: query.status,
      };
    }
    if (query.branchId) {
      where.cards = {
        some: {
          deletedAt: null,
          branchId: query.branchId,
        },
      };
    }
    if (query.q) {
      const normalized = (() => {
        try {
          return normalizePhones([query.q])[0];
        } catch {
          return null;
        }
      })();
      where.OR = [
        { fullName: { contains: query.q, mode: "insensitive" } },
        ...(normalized ? [{ phones: { has: normalized } }] : []),
        { phones: { hasSome: [query.q] } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.t.contact.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          responsible: { select: { id: true, fullName: true } },
          cards: {
            where: { deletedAt: null },
            orderBy: { updatedAt: "desc" },
            take: 1,
            select: {
              id: true,
              title: true,
              status: true,
              budget: true,
              branchId: true,
              updatedAt: true,
              branch: { select: { id: true, name: true } },
              responsible: { select: { id: true, fullName: true } },
              stage: { select: { id: true, name: true, type: true } },
            },
          },
        },
      }),
      this.prisma.t.contact.count({ where }),
    ]);

    return {
      items: items.map((contact) => {
        const acoustic = this.acousticFields(contact.customFields);
        return {
          id: contact.id,
          fullName: contact.fullName,
          phones: contact.phones,
          source: contact.source,
          responsible: contact.responsible,
          createdAt: contact.createdAt,
          updatedAt: contact.updatedAt,
          acoustic,
          card: contact.cards[0] ?? null,
        };
      }),
      total,
      page,
      pageSize,
    };
  }

  async findById(id: string) {
    const contact = await this.prisma.t.contact.findFirst({
      where: { id, deletedAt: null },
    });
    if (!contact) throw new NotFoundException("Contact not found");
    return contact;
  }

  async update(id: string, dto: UpdateContactDto) {
    await this.findById(id); // ensures it exists in this tenant
    const data: Prisma.ContactUpdateInput = {};
    if (dto.fullName !== undefined) data.fullName = dto.fullName;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.source !== undefined) data.source = dto.source;
    if (dto.responsibleUserId !== undefined) {
      data.responsible = dto.responsibleUserId
        ? { connect: { id: dto.responsibleUserId } }
        : { disconnect: true };
    }
    if (dto.phones !== undefined) {
      const phones = normalizePhones(dto.phones);
      const dup = await this.findByPhones(phones, id);
      if (dup.length > 0) {
        throw new ConflictException({
          message: "One of these phones is already used by another contact",
          duplicates: dup.map((c) => ({ id: c.id, fullName: c.fullName })),
        });
      }
      data.phones = phones;
    }
    return this.prisma.t.contact.update({ where: { id }, data });
  }

  async softDelete(id: string): Promise<{ id: string }> {
    await this.findById(id);
    await this.prisma.t.contact.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { id };
  }

  /** Returns contacts that share any phone with the input list. Excludes a
   * specific id (for update flows checking against itself). */
  async findByPhones(phones: string[], excludeId?: string) {
    const normalized = normalizePhones(phones);
    const where: Prisma.ContactWhereInput = {
      deletedAt: null,
      phones: { hasSome: normalized },
    };
    if (excludeId) {
      where.id = { not: excludeId };
    }
    return this.prisma.t.contact.findMany({
      where,
      select: { id: true, fullName: true, phones: true },
    });
  }

  /**
   * Find-or-create by phone — used by lead intake to attach incoming leads
   * to existing contacts when their phone is already known.
   */
  async findOrCreateByPhone(input: { fullName: string; phone: string; source?: string }) {
    const tenantId = this.currentTenantId();
    const phones = [input.phone];
    const existing = await this.findByPhones(phones);
    if (existing.length > 0) {
      return this.prisma.t.contact.findFirst({
        where: { id: existing[0].id, deletedAt: null },
      });
    }
    return this.prisma.t.contact.create({
      data: {
        tenantId,
        fullName: input.fullName,
        phones: normalizePhones(phones),
        source: input.source ?? null,
      },
    });
  }

  private acousticFields(value: Prisma.JsonValue): Record<string, unknown> | null {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
    const acoustic = (value as Record<string, unknown>).acousticAnalytics;
    if (typeof acoustic !== "object" || acoustic === null || Array.isArray(acoustic)) return null;
    return acoustic as Record<string, unknown>;
  }
}
