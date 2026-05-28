import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { ClsService } from "nestjs-cls";
import { readContext } from "../../common/tenant-context";
import { PrismaService } from "../prisma/prisma.service";
import { CreateTriggerDto, UpdateTriggerDto } from "./dto/trigger.dto";

@Injectable()
export class TriggersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  private currentTenantId(): string {
    const tid = readContext(this.cls).tenantId;
    if (!tid) throw new UnauthorizedException("No tenant context");
    return tid;
  }

  async create(dto: CreateTriggerDto) {
    const tenantId = this.currentTenantId();
    return this.prisma.t.trigger.create({
      data: {
        tenantId,
        pipelineId: dto.pipelineId ?? null,
        name: dto.name,
        event: dto.event as object,
        conditions: (dto.conditions ?? {}) as object,
        actions: dto.actions as object,
        isActive: dto.isActive ?? true,
      },
    });
  }

  list() {
    return this.prisma.t.trigger.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
  }

  async findById(id: string) {
    const t = await this.prisma.t.trigger.findFirst({
      where: { id, deletedAt: null },
    });
    if (!t) throw new NotFoundException("Trigger not found");
    return t;
  }

  async update(id: string, dto: UpdateTriggerDto) {
    await this.findById(id);
    return this.prisma.t.trigger.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.event !== undefined ? { event: dto.event as object } : {}),
        ...(dto.conditions !== undefined ? { conditions: dto.conditions as object } : {}),
        ...(dto.actions !== undefined ? { actions: dto.actions as object } : {}),
        ...(dto.pipelineId !== undefined ? { pipelineId: dto.pipelineId } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  async softDelete(id: string): Promise<{ id: string }> {
    await this.findById(id);
    await this.prisma.t.trigger.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { id };
  }

  /**
   * Engine-facing lookup: all active triggers for a given tenant + event type,
   * optionally scoped to a pipeline. Uses base prisma (no extension) so the
   * engine — running outside the request context — can still load them.
   */
  async findActiveByEvent(input: {
    tenantId: string;
    eventType: string;
    pipelineId?: string;
  }) {
    return this.prisma.trigger.findMany({
      where: {
        tenantId: input.tenantId,
        deletedAt: null,
        isActive: true,
        ...(input.pipelineId
          ? { OR: [{ pipelineId: null }, { pipelineId: input.pipelineId }] }
          : {}),
      },
    });
  }
}
