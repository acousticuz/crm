import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { ClsService } from "nestjs-cls";
import { StageType, SOCKET_EVENTS } from "@acoustic-crm/shared";
import { readContext } from "../../common/tenant-context";
import { PrismaService } from "../prisma/prisma.service";
import { RealtimeService } from "../realtime/realtime.service";
import { CreatePipelineDto, UpdatePipelineDto } from "./dto/pipeline.dto";
import { CreateStageDto, UpdateStageDto } from "./dto/stage.dto";

@Injectable()
export class PipelinesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
    private readonly realtime: RealtimeService,
  ) {}

  private currentTenantId(): string {
    const tid = readContext(this.cls).tenantId;
    if (!tid) throw new UnauthorizedException("No tenant context");
    return tid;
  }

  /** Tell connected clients the pipeline layout changed so the Kanban board
   * refetches. Best-effort — RealtimeService no-ops when no server is set. */
  private emitChanged(tenantId: string): void {
    this.realtime.toTenant(tenantId, SOCKET_EVENTS.PIPELINE_UPDATED, {});
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
    const created = await this.prisma.t.pipeline.create({
      data: {
        tenantId,
        name: dto.name,
        isDefault: dto.isDefault ?? false,
        order,
      },
    });
    this.emitChanged(tenantId);
    return created;
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
    const updated = await this.prisma.t.pipeline.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
        ...(dto.order !== undefined ? { order: dto.order } : {}),
      },
    });
    this.emitChanged(this.currentTenantId());
    return updated;
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
    this.emitChanged(this.currentTenantId());
    return { id: pipeline.id };
  }

  // ===== Stages =====

  async createStage(pipelineId: string, dto: CreateStageDto) {
    const tenantId = this.currentTenantId();
    await this.findPipeline(pipelineId); // tenant-scoped existence check
    const created = await this.prisma.t.stage.create({
      data: {
        tenantId,
        pipelineId,
        name: dto.name,
        order: dto.order,
        color: dto.color ?? "#94a3b8",
        type: dto.type ?? StageType.NORMAL,
      },
    });
    this.emitChanged(tenantId);
    return created;
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
    const updated = await this.prisma.t.stage.update({
      where: { id: stageId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.order !== undefined ? { order: dto.order } : {}),
        ...(dto.color !== undefined ? { color: dto.color } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
      },
    });
    this.emitChanged(this.currentTenantId());
    return updated;
  }

  /**
   * Deletes a stage and MOVES its cards to another stage (never loses them).
   * Target: explicit `reassignToStageId`, else the first remaining NORMAL
   * stage in the pipeline (by order), else any remaining stage. Refuses only
   * if it's the pipeline's last stage (nowhere to move cards).
   */
  async deleteStage(stageId: string, reassignToStageId?: string): Promise<{ id: string; movedCards: number; movedToStageId: string | null }> {
    const tenantId = this.currentTenantId();
    const stage = await this.prisma.t.stage.findFirst({
      where: { id: stageId, deletedAt: null },
    });
    if (!stage) throw new NotFoundException("Stage not found");

    const liveCards = await this.prisma.t.card.count({
      where: { stageId, deletedAt: null },
    });

    let movedToStageId: string | null = null;
    if (liveCards > 0) {
      // Pick the destination stage.
      const target = reassignToStageId
        ? await this.prisma.t.stage.findFirst({
            where: { id: reassignToStageId, pipelineId: stage.pipelineId, deletedAt: null },
          })
        : await this.prisma.t.stage.findFirst({
            where: {
              pipelineId: stage.pipelineId,
              deletedAt: null,
              type: StageType.NORMAL,
              NOT: { id: stageId },
            },
            orderBy: { order: "asc" },
          }) ??
          (await this.prisma.t.stage.findFirst({
            where: { pipelineId: stage.pipelineId, deletedAt: null, NOT: { id: stageId } },
            orderBy: { order: "asc" },
          }));
      if (!target) {
        throw new BadRequestException(
          "Cannot delete the last stage of a pipeline — create another stage first",
        );
      }
      const moved = await this.prisma.t.card.updateMany({
        where: { stageId, deletedAt: null },
        data: { stageId: target.id, enteredStageAt: new Date() },
      });
      movedToStageId = target.id;
      void moved;
    }

    await this.prisma.t.stage.update({
      where: { id: stage.id },
      data: { deletedAt: new Date() },
    });
    this.emitChanged(tenantId);
    return { id: stage.id, movedCards: liveCards, movedToStageId };
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
    this.emitChanged(this.currentTenantId());
    return this.listStages(pipelineId);
  }
}
