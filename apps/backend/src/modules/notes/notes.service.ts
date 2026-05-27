import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { ClsService } from "nestjs-cls";
import { UserRole } from "@acoustic-crm/shared";
import { readContext } from "../../common/tenant-context";
import { PrismaService } from "../prisma/prisma.service";
import { CreateNoteDto, UpdateNoteDto } from "./dto/note.dto";

@Injectable()
export class NotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  private requireUser(): { userId: string; tenantId: string; role: UserRole } {
    const ctx = readContext(this.cls);
    if (!ctx.userId || !ctx.tenantId || !ctx.role) {
      throw new UnauthorizedException("Authentication required");
    }
    return { userId: ctx.userId, tenantId: ctx.tenantId, role: ctx.role };
  }

  async create(dto: CreateNoteDto) {
    const { userId, tenantId } = this.requireUser();
    if (!dto.cardId && !dto.contactId) {
      throw new BadRequestException("Either cardId or contactId is required");
    }
    return this.prisma.t.note.create({
      data: {
        tenantId,
        cardId: dto.cardId ?? null,
        contactId: dto.contactId ?? null,
        authorId: userId,
        text: dto.text,
      },
      include: { author: { select: { id: true, fullName: true } } },
    });
  }

  listByCard(cardId: string) {
    return this.prisma.t.note.findMany({
      where: { cardId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      include: { author: { select: { id: true, fullName: true } } },
    });
  }

  listByContact(contactId: string) {
    return this.prisma.t.note.findMany({
      where: { contactId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      include: { author: { select: { id: true, fullName: true } } },
    });
  }

  async update(id: string, dto: UpdateNoteDto) {
    const { userId, role } = this.requireUser();
    const note = await this.prisma.t.note.findFirst({
      where: { id, deletedAt: null },
    });
    if (!note) throw new NotFoundException("Note not found");
    // Only the author OR a privileged role can edit.
    if (note.authorId !== userId && ![UserRole.TENANT_ADMIN, UserRole.SUPERVISOR].includes(role)) {
      throw new ForbiddenException("Only the author may edit this note");
    }
    return this.prisma.t.note.update({
      where: { id },
      data: { text: dto.text },
      include: { author: { select: { id: true, fullName: true } } },
    });
  }

  async softDelete(id: string): Promise<{ id: string }> {
    const { userId, role } = this.requireUser();
    const note = await this.prisma.t.note.findFirst({
      where: { id, deletedAt: null },
    });
    if (!note) throw new NotFoundException("Note not found");
    if (note.authorId !== userId && ![UserRole.TENANT_ADMIN, UserRole.SUPERVISOR].includes(role)) {
      throw new ForbiddenException("Only the author may delete this note");
    }
    await this.prisma.t.note.update({ where: { id }, data: { deletedAt: new Date() } });
    return { id };
  }
}
