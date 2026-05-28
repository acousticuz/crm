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
import { UserRole, type JwtPayload } from "@acoustic-crm/shared";
import { Public } from "../../common/decorators/public.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { Audit } from "../../common/decorators/audit.decorator";
import { WorkerGuard } from "../calls/worker.guard";
import { QaService } from "./qa.service";
import { CreateScriptDto, UpdateScriptDto } from "./dto/script.dto";
import {
  QaOverrideDto,
  WriteAnalysisDto,
  WriteQAScoreDto,
} from "./dto/internal.dto";

@Controller()
export class QaController {
  constructor(private readonly qa: QaService) {}

  // ===== Scripts =====

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.TENANT_ADMIN, UserRole.SUPERVISOR, UserRole.ANALYST, UserRole.OPERATOR)
  @Get("qa/scripts")
  listScripts() {
    return this.qa.listScripts();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.TENANT_ADMIN, UserRole.SUPERVISOR)
  @Post("qa/scripts")
  @Audit({ action: "qa.script.create", entityType: "Script", entityIdPath: "result.id" })
  createScript(@Body() dto: CreateScriptDto) {
    return this.qa.createScript(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.TENANT_ADMIN, UserRole.SUPERVISOR, UserRole.ANALYST, UserRole.OPERATOR)
  @Get("qa/scripts/:id")
  findScript(@Param("id") id: string) {
    return this.qa.findScript(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.TENANT_ADMIN, UserRole.SUPERVISOR)
  @Patch("qa/scripts/:id")
  @Audit({ action: "qa.script.update", entityType: "Script", entityIdPath: "params.id" })
  updateScript(@Param("id") id: string, @Body() dto: UpdateScriptDto) {
    return this.qa.updateScript(id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.TENANT_ADMIN, UserRole.SUPERVISOR)
  @Delete("qa/scripts/:id")
  @HttpCode(HttpStatus.OK)
  @Audit({ action: "qa.script.delete", entityType: "Script", entityIdPath: "params.id" })
  deleteScript(@Param("id") id: string) {
    return this.qa.deleteScript(id);
  }

  // ===== Scorecard read =====

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.TENANT_ADMIN, UserRole.SUPERVISOR, UserRole.ANALYST, UserRole.OPERATOR)
  @Get("qa/scorecard/:callId")
  scorecard(@Param("callId") callId: string) {
    return this.qa.scorecard(callId);
  }

  // ===== Supervisor override =====

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.TENANT_ADMIN, UserRole.SUPERVISOR)
  @Patch("qa/scores/:id/override")
  @Audit({ action: "qa.override", entityType: "QAScore", entityIdPath: "params.id" })
  override(
    @Param("id") id: string,
    @Body() dto: QaOverrideDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.qa.overrideScore(id, dto, user.sub);
  }

  // ===== Internal worker endpoints =====

  @Public()
  @UseGuards(WorkerGuard)
  @Post("internal/analyses")
  @HttpCode(HttpStatus.OK)
  writeAnalysis(@Body() dto: WriteAnalysisDto) {
    return this.qa.writeAnalysis(dto);
  }

  @Public()
  @UseGuards(WorkerGuard)
  @Post("internal/qa-scores")
  @HttpCode(HttpStatus.OK)
  writeQAScore(@Body() dto: WriteQAScoreDto) {
    return this.qa.writeQAScore(dto);
  }
}
