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
import { TagsService } from "./tags.service";
import { CreateTagDto, UpdateTagDto } from "./dto/tag.dto";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("tags")
export class TagsController {
  constructor(private readonly service: TagsService) {}

  @Roles(UserRole.TENANT_ADMIN, UserRole.SUPERVISOR, UserRole.OPERATOR, UserRole.ANALYST)
  @Get()
  list() {
    return this.service.list();
  }

  // Operators can create tags inline from the card panel — quicker than
  // routing every new label through an admin. Recolor/delete still admin-only.
  @Roles(UserRole.TENANT_ADMIN, UserRole.SUPERVISOR, UserRole.OPERATOR)
  @Post()
  @Audit({ action: "tag.create", entityType: "Tag", entityIdPath: "result.id" })
  create(@Body() dto: CreateTagDto) {
    return this.service.create(dto);
  }

  @Roles(UserRole.TENANT_ADMIN, UserRole.SUPERVISOR)
  @Patch(":id")
  @Audit({ action: "tag.update", entityType: "Tag", entityIdPath: "params.id" })
  update(@Param("id") id: string, @Body() dto: UpdateTagDto) {
    return this.service.update(id, dto);
  }

  @Roles(UserRole.TENANT_ADMIN, UserRole.SUPERVISOR)
  @Delete(":id")
  @HttpCode(HttpStatus.OK)
  @Audit({ action: "tag.delete", entityType: "Tag", entityIdPath: "params.id" })
  remove(@Param("id") id: string) {
    return this.service.softDelete(id);
  }
}
