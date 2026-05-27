import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { UserRole } from "@acoustic-crm/shared";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { Audit } from "../../common/decorators/audit.decorator";
import { PipelinesService } from "./pipelines.service";
import { CreatePipelineDto, UpdatePipelineDto } from "./dto/pipeline.dto";
import { CreateStageDto, UpdateStageDto } from "./dto/stage.dto";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("pipelines")
export class PipelinesController {
  constructor(private readonly service: PipelinesService) {}

  @Roles(UserRole.TENANT_ADMIN, UserRole.SUPERVISOR, UserRole.OPERATOR, UserRole.ANALYST)
  @Get()
  list() {
    return this.service.listPipelines();
  }

  @Roles(UserRole.TENANT_ADMIN, UserRole.SUPERVISOR, UserRole.OPERATOR, UserRole.ANALYST)
  @Get(":id")
  get(@Param("id") id: string) {
    return this.service.findPipeline(id);
  }

  @Roles(UserRole.TENANT_ADMIN)
  @Post()
  @Audit({ action: "pipeline.create", entityType: "Pipeline", entityIdPath: "result.id" })
  create(@Body() dto: CreatePipelineDto) {
    return this.service.createPipeline(dto);
  }

  @Roles(UserRole.TENANT_ADMIN)
  @Patch(":id")
  @Audit({ action: "pipeline.update", entityType: "Pipeline", entityIdPath: "params.id" })
  update(@Param("id") id: string, @Body() dto: UpdatePipelineDto) {
    return this.service.updatePipeline(id, dto);
  }

  @Roles(UserRole.TENANT_ADMIN)
  @Delete(":id")
  @HttpCode(HttpStatus.OK)
  @Audit({ action: "pipeline.delete", entityType: "Pipeline", entityIdPath: "params.id" })
  remove(@Param("id") id: string) {
    return this.service.deletePipeline(id);
  }

  // ===== Stages (nested under pipeline) =====

  @Roles(UserRole.TENANT_ADMIN, UserRole.SUPERVISOR, UserRole.OPERATOR, UserRole.ANALYST)
  @Get(":id/stages")
  listStages(@Param("id") id: string) {
    return this.service.listStages(id);
  }

  @Roles(UserRole.TENANT_ADMIN)
  @Post(":id/stages")
  @Audit({ action: "stage.create", entityType: "Stage", entityIdPath: "result.id" })
  createStage(@Param("id") pipelineId: string, @Body() dto: CreateStageDto) {
    return this.service.createStage(pipelineId, dto);
  }

  @Roles(UserRole.TENANT_ADMIN)
  @Patch(":id/stages/:stageId")
  @Audit({ action: "stage.update", entityType: "Stage", entityIdPath: "params.stageId" })
  updateStage(@Param("stageId") stageId: string, @Body() dto: UpdateStageDto) {
    return this.service.updateStage(stageId, dto);
  }

  @Roles(UserRole.TENANT_ADMIN)
  @Delete(":id/stages/:stageId")
  @HttpCode(HttpStatus.OK)
  @Audit({ action: "stage.delete", entityType: "Stage", entityIdPath: "params.stageId" })
  deleteStage(@Param("stageId") stageId: string) {
    return this.service.deleteStage(stageId);
  }

  @Roles(UserRole.TENANT_ADMIN, UserRole.SUPERVISOR)
  @Post(":id/stages/reorder")
  @HttpCode(HttpStatus.OK)
  @Audit({ action: "stage.reorder", entityType: "Pipeline", entityIdPath: "params.id" })
  reorderStages(@Param("id") pipelineId: string, @Body() body: { stageIds: string[] }) {
    return this.service.reorderStages(pipelineId, body.stageIds);
  }
}
