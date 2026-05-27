import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { ClsService } from "nestjs-cls";
import { readContext } from "../../common/tenant-context";
import { PrismaService } from "../prisma/prisma.service";
import { CreateTagDto, UpdateTagDto } from "./dto/tag.dto";

@Injectable()
export class TagsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  private currentTenantId(): string {
    const tid = readContext(this.cls).tenantId;
    if (!tid) throw new UnauthorizedException("No tenant context");
    return tid;
  }

  async create(dto: CreateTagDto) {
    const tenantId = this.currentTenantId();
    try {
      return await this.prisma.t.tag.create({
        data: {
          tenantId,
          name: dto.name,
          color: dto.color ?? "#64748b",
        },
      });
    } catch (err) {
      const e = err as { code?: string };
      if (e.code === "P2002") {
        throw new ConflictException(`Tag "${dto.name}" already exists`);
      }
      throw err;
    }
  }

  list() {
    return this.prisma.t.tag.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
    });
  }

  async findById(id: string) {
    const tag = await this.prisma.t.tag.findFirst({
      where: { id, deletedAt: null },
    });
    if (!tag) throw new NotFoundException("Tag not found");
    return tag;
  }

  async update(id: string, dto: UpdateTagDto) {
    await this.findById(id);
    return this.prisma.t.tag.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.color !== undefined ? { color: dto.color } : {}),
      },
    });
  }

  async softDelete(id: string): Promise<{ id: string }> {
    await this.findById(id);
    // Detach from all cards first (CardTag join rows).
    await this.prisma.cardTag.deleteMany({ where: { tagId: id } });
    await this.prisma.t.tag.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { id };
  }

  /**
   * Attach a tag to a card. Idempotent — if already attached, returns the
   * existing CardTag row. Verifies both card and tag belong to the tenant
   * (via the Prisma extension implicitly).
   */
  async attach(cardId: string, tagId: string) {
    await this.findById(tagId);
    const card = await this.prisma.t.card.findFirst({
      where: { id: cardId, deletedAt: null },
    });
    if (!card) throw new NotFoundException("Card not found");
    return this.prisma.cardTag.upsert({
      where: { cardId_tagId: { cardId, tagId } },
      create: { cardId, tagId },
      update: {},
    });
  }

  async detach(cardId: string, tagId: string): Promise<{ cardId: string; tagId: string }> {
    // Verify both exist in tenant — guards against cross-tenant detach.
    await this.findById(tagId);
    const card = await this.prisma.t.card.findFirst({
      where: { id: cardId, deletedAt: null },
    });
    if (!card) throw new NotFoundException("Card not found");
    await this.prisma.cardTag.deleteMany({ where: { cardId, tagId } });
    return { cardId, tagId };
  }
}
