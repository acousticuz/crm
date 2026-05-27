import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { ClsService } from "nestjs-cls";
import { StageType } from "@acoustic-crm/shared";
import { readContext } from "../../common/tenant-context";
import { PrismaService } from "../prisma/prisma.service";
import { CreatePipelineDto, UpdatePipelineDto } from "./dto/pipeline.dto";
import { CreateStageDto, UpdateStageDto } from "./dto/stage.dto";

@Injectable()
export class PipelinesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  private currentTenantId(): string {
    const tid = readContext(this.cls).tenantId;
    if (!tid) throw new UnauthorizedException("No tenant context");
    return tid;
  }

  // ===== Pipelines =====

  async createPipeline(dto: CreatePipelineDto) {
    const tenantId = this.currentTenantId();
    const order = dto.order ?? (await this.prisma.t.pipeline.count({ where: { deletedAt: null } }));
    if (dto.isDefault) {
      await this.prisma.t.pipeline.updateMany({
        where: { isDefault: true, deletedAt: null },
        data: { isDefault: false },
      });
    }
    return this.prisma.t.pipeline.create({
      data: {
        tenantId,
        name: dto.name,
        isDefault: dto.isDefault ?? false,
        order,
      },
    });
  }

  listPipelines() {
    return this.prisma.t.pipeline.findMany({
      where: { deletedAt: null },
      orderBy: { order: "asc" },
      include: {
        stages: {
          where: { deletedAt: null },
          orderBy: { order: "asc" },
        },
      },
    });
  }

  async findPipeline(id: string) {
    const p = await this.prisma.t.pipeline.findFirst({
      where: { id, deletedAt: null },
      include: {
        stages: { where: { deletedAt: null }, orderBy: { order: "asc" } },
      },
    });
    if (!p) throw new NotFoundException("Pipeline not found");
    return p;
  }

  async updatePipeline(id: string, dto: UpdatePipelineDto) {
    await this.findPipeline(id);
    if (dto.isDefault === true) {
      await this.prisma.t.pipeline.updateMany({
        where: { isDefault: true, deletedAt: null, NOT: { id } },
        data: { isDefault: false },
      });
    }
    return this.prisma.t.pipeline.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
        ...(dto.order !== undefined ? { order: dto.order } : {}),
      },
    });
  }

  async deletePipeline(id: string): Promise<{ id: string }> {
    const pipeline = await this.findPipeline(id);
    // Refuse if pipeline still has open cards.
    const liveCards = await this.prisma.t.card.count({
      where: { pipelineId: id, deletedAt: null },
    });
    if (liveCards > 0) {
      throw new BadRequestException(
        `Pipeline has ${liveCards} card(s); reassign or delete them first`,
      );
    }
    await this.prisma.t.pipeline.update({
      where: { id: pipeline.id },
      data: { deletedAt: new Date() },
    });
    return { id: pipeline.id };
  }

  // ===== Stages =====

  async createStage(pipelineId: string, dto: CreateStageDto) {
    const tenantId = this.currentTenantId();
    await this.findPipeline(pipelineId); // tenant-scoped existence check
    return this.prisma.t.stage.create({
      data: {
        tenantId,
        pipelineId,
        name: dto.name,
        order: dto.order,
        color: dto.color ?? "#94a3b8",
        type: dto.type ?? StageType.NORMAL,
      },
    });
  }

  async listStages(pipelineId: string) {
    await this.findPipeline(pipelineId);
    return this.prisma.t.stage.findMany({
      where: { pipelineId, deletedAt: null },
      orderBy: { order: "asc" },
    });
  }

  async updateStage(stageId: string, dto: UpdateStageDto) {
    const stage = await this.prisma.t.stage.findFirst({
      where: { id: stageId, deletedAt: null },
    });
    if (!stage) throw new NotFoundException("Stage not found");
    return this.prisma.t.stage.update({
      where: { id: stageId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.order !== undefined ? { order: dto.order } : {}),
        ...(dto.color !== undefined ? { color: dto.color } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
      },
    });
  }

  async deleteStage(stageId: string): Promise<{ id: string }> {
    const stage = await this.prisma.t.stage.findFirst({
      where: { id: stageId, deletedAt: null },
    });
    if (!stage) throw new NotFoundException("Stage not found");
    const liveCards = await this.prisma.t.card.count({
      where: { stageId, deletedAt: null },
    });
    if (liveCards > 0) {
      throw new BadRequestException(
        `Stage has ${liveCards} card(s); move them before deleting`,
      );
    }
    await this.prisma.t.stage.update({
      where: { id: stage.id },
      data: { deletedAt: new Date() },
    });
    return { id: stage.id };
  }

  /**
   * Bulk-reorder stages within a pipeline. Accepts an array of stageIds in
   * desired order; assigns 0..N as `order` field in a single transaction.
   */
  async reorderStages(pipelineId: string, stageIds: string[]) {
    await this.findPipeline(pipelineId);
    const stages = await this.prisma.t.stage.findMany({
      where: { pipelineId, deletedAt: null },
      select: { id: true },
    });
    const known = new Set(stages.map((s) => s.id));
    for (const sid of stageIds) {
      if (!known.has(sid)) {
        throw new BadRequestException(`Stage ${sid} not in pipeline ${pipelineId}`);
      }
    }
    if (stageIds.length !== known.size) {
      throw new BadRequestException("All stage ids must be provided exactly once");
    }
    await this.prisma.$transaction(
      stageIds.map((id, idx) =>
        this.prisma.t.stage.update({ where: { id }, data: { order: idx } }),
      ),
    );
    return this.listStages(pipelineId);
  }
}
