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
  Query,
  UseGuards,
} from "@nestjs/common";
import { UserRole, type JwtPayload } from "@acoustic-crm/shared";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { Audit } from "../../common/decorators/audit.decorator";
import { TasksService } from "./tasks.service";
import { CreateTaskDto, UpdateTaskDto } from "./dto/task.dto";

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.TENANT_ADMIN, UserRole.SUPERVISOR, UserRole.OPERATOR, UserRole.ANALYST)
@Controller("tasks")
export class TasksController {
  constructor(private readonly service: TasksService) {}

  @Get()
  list(
    @Query("cardId") cardId?: string,
    @Query("mine") mine?: string,
    @Query("completed") completed?: string,
    @CurrentUser() user?: JwtPayload,
  ) {
    if (cardId) return this.service.listByCard(cardId);
    if (mine === "1" && user) {
      return this.service.listForUser(user.sub, {
        completed: completed === "1" ? true : completed === "0" ? false : undefined,
      });
    }
    return [];
  }

  @Roles(UserRole.TENANT_ADMIN, UserRole.SUPERVISOR, UserRole.OPERATOR)
  @Post()
  @Audit({ action: "task.create", entityType: "Task", entityIdPath: "result.id" })
  create(@Body() dto: CreateTaskDto) {
    return this.service.create(dto);
  }

  @Roles(UserRole.TENANT_ADMIN, UserRole.SUPERVISOR, UserRole.OPERATOR)
  @Patch(":id")
  @Audit({ action: "task.update", entityType: "Task", entityIdPath: "params.id" })
  update(@Param("id") id: string, @Body() dto: UpdateTaskDto) {
    return this.service.update(id, dto);
  }

  @Roles(UserRole.TENANT_ADMIN, UserRole.SUPERVISOR, UserRole.OPERATOR)
  @Post(":id/complete")
  @HttpCode(HttpStatus.OK)
  @Audit({ action: "task.complete", entityType: "Task", entityIdPath: "params.id" })
  complete(@Param("id") id: string, @Body() body: { result?: string }) {
    return this.service.complete(id, body?.result);
  }

  @Roles(UserRole.TENANT_ADMIN, UserRole.SUPERVISOR, UserRole.OPERATOR)
  @Delete(":id")
  @HttpCode(HttpStatus.OK)
  @Audit({ action: "task.delete", entityType: "Task", entityIdPath: "params.id" })
  remove(@Param("id") id: string) {
    return this.service.softDelete(id);
  }
}
