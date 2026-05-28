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
import { TriggersService } from "./triggers.service";
import { CreateTriggerDto, UpdateTriggerDto } from "./dto/trigger.dto";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("triggers")
export class TriggersController {
  constructor(private readonly triggers: TriggersService) {}

  @Roles(UserRole.TENANT_ADMIN, UserRole.SUPERVISOR, UserRole.ANALYST)
  @Get()
  list() {
    return this.triggers.list();
  }

  @Roles(UserRole.TENANT_ADMIN, UserRole.SUPERVISOR, UserRole.ANALYST)
  @Get(":id")
  get(@Param("id") id: string) {
    return this.triggers.findById(id);
  }

  @Roles(UserRole.TENANT_ADMIN)
  @Post()
  @Audit({ action: "trigger.create", entityType: "Trigger", entityIdPath: "result.id" })
  create(@Body() dto: CreateTriggerDto) {
    return this.triggers.create(dto);
  }

  @Roles(UserRole.TENANT_ADMIN)
  @Patch(":id")
  @Audit({ action: "trigger.update", entityType: "Trigger", entityIdPath: "params.id" })
  update(@Param("id") id: string, @Body() dto: UpdateTriggerDto) {
    return this.triggers.update(id, dto);
  }

  @Roles(UserRole.TENANT_ADMIN)
  @Delete(":id")
  @HttpCode(HttpStatus.OK)
  @Audit({ action: "trigger.delete", entityType: "Trigger", entityIdPath: "params.id" })
  remove(@Param("id") id: string) {
    return this.triggers.softDelete(id);
  }
}
