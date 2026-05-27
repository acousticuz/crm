import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { ClsService } from "nestjs-cls";
import { TaskType } from "@acoustic-crm/shared";
import { readContext } from "../../common/tenant-context";
import { PrismaService } from "../prisma/prisma.service";
import { CreateTaskDto, UpdateTaskDto } from "./dto/task.dto";

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  private currentTenantId(): string {
    const tid = readContext(this.cls).tenantId;
    if (!tid) throw new UnauthorizedException("No tenant context");
    return tid;
  }

  async create(dto: CreateTaskDto) {
    const tenantId = this.currentTenantId();
    if (!dto.cardId && !dto.contactId) {
      throw new BadRequestException("Either cardId or contactId is required");
    }
    return this.prisma.t.task.create({
      data: {
        tenantId,
        cardId: dto.cardId ?? null,
        contactId: dto.contactId ?? null,
        assigneeId: dto.assigneeId,
        text: dto.text,
        type: dto.type ?? TaskType.CUSTOM,
        dueAt: new Date(dto.dueAt),
      },
      include: { assignee: { select: { id: true, fullName: true } } },
    });
  }

  listByCard(cardId: string) {
    return this.prisma.t.task.findMany({
      where: { cardId, deletedAt: null },
      orderBy: [{ completedAt: "asc" }, { dueAt: "asc" }],
      include: { assignee: { select: { id: true, fullName: true } } },
    });
  }

  listForUser(userId: string, opts?: { completed?: boolean }) {
    const where: Prisma.TaskWhereInput = {
      assigneeId: userId,
      deletedAt: null,
    };
    if (opts?.completed === false) where.completedAt = null;
    if (opts?.completed === true) where.completedAt = { not: null };
    return this.prisma.t.task.findMany({
      where,
      orderBy: { dueAt: "asc" },
      include: { card: { select: { id: true, title: true } } },
    });
  }

  async update(id: string, dto: UpdateTaskDto) {
    const existing = await this.prisma.t.task.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException("Task not found");
    const data: Prisma.TaskUpdateInput = {};
    if (dto.text !== undefined) data.text = dto.text;
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.dueAt !== undefined) data.dueAt = new Date(dto.dueAt);
    if (dto.completedAt !== undefined) {
      data.completedAt = dto.completedAt ? new Date(dto.completedAt) : null;
    }
    if (dto.result !== undefined) data.result = dto.result;
    if (dto.assigneeId !== undefined) {
      data.assignee = { connect: { id: dto.assigneeId } };
    }
    return this.prisma.t.task.update({
      where: { id },
      data,
      include: { assignee: { select: { id: true, fullName: true } } },
    });
  }

  async complete(id: string, result?: string) {
    return this.update(id, {
      completedAt: new Date().toISOString(),
      result,
    });
  }

  async softDelete(id: string): Promise<{ id: string }> {
    const existing = await this.prisma.t.task.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException("Task not found");
    await this.prisma.t.task.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { id };
  }
}
