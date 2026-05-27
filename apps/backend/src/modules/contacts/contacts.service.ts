import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { ClsService } from "nestjs-cls";
import { readContext } from "../../common/tenant-context";
import { normalizePhones } from "../../common/phone";
import { PrismaService } from "../prisma/prisma.service";
import { CreateContactDto } from "./dto/create-contact.dto";
import { UpdateContactDto } from "./dto/update-contact.dto";
import { FindContactsDto } from "./dto/find-contacts.dto";

const DEFAULT_PAGE_SIZE = 20;

@Injectable()
export class ContactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
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
}
