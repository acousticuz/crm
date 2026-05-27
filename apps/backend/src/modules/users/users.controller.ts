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
import { UsersService } from "./users.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("users")
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Roles(UserRole.TENANT_ADMIN)
  @Post()
  @Audit({ action: "user.create", entityType: "User", entityIdPath: "result.id" })
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }

  @Roles(UserRole.TENANT_ADMIN, UserRole.SUPERVISOR, UserRole.ANALYST)
  @Get()
  list() {
    return this.users.list();
  }

  @Roles(UserRole.TENANT_ADMIN, UserRole.SUPERVISOR, UserRole.ANALYST)
  @Get(":id")
  get(@Param("id") id: string) {
    return this.users.findById(id);
  }

  @Roles(UserRole.TENANT_ADMIN)
  @Patch(":id")
  @Audit({ action: "user.update", entityType: "User", entityIdPath: "params.id" })
  update(@Param("id") id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(id, dto);
  }

  @Roles(UserRole.TENANT_ADMIN)
  @Delete(":id")
  @HttpCode(HttpStatus.OK)
  @Audit({ action: "user.delete", entityType: "User", entityIdPath: "params.id" })
  remove(@Param("id") id: string) {
    return this.users.softDelete(id);
  }
}
