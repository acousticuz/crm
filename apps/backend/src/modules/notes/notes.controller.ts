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
import { UserRole } from "@acoustic-crm/shared";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { Audit } from "../../common/decorators/audit.decorator";
import { NotesService } from "./notes.service";
import { CreateNoteDto, UpdateNoteDto } from "./dto/note.dto";

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.TENANT_ADMIN, UserRole.SUPERVISOR, UserRole.OPERATOR, UserRole.ANALYST)
@Controller("notes")
export class NotesController {
  constructor(private readonly service: NotesService) {}

  @Get()
  list(@Query("cardId") cardId?: string, @Query("contactId") contactId?: string) {
    if (cardId) return this.service.listByCard(cardId);
    if (contactId) return this.service.listByContact(contactId);
    return [];
  }

  @Roles(UserRole.TENANT_ADMIN, UserRole.SUPERVISOR, UserRole.OPERATOR)
  @Post()
  @Audit({ action: "note.create", entityType: "Note", entityIdPath: "result.id" })
  create(@Body() dto: CreateNoteDto) {
    return this.service.create(dto);
  }

  @Roles(UserRole.TENANT_ADMIN, UserRole.SUPERVISOR, UserRole.OPERATOR)
  @Patch(":id")
  @Audit({ action: "note.update", entityType: "Note", entityIdPath: "params.id" })
  update(@Param("id") id: string, @Body() dto: UpdateNoteDto) {
    return this.service.update(id, dto);
  }

  @Roles(UserRole.TENANT_ADMIN, UserRole.SUPERVISOR, UserRole.OPERATOR)
  @Delete(":id")
  @HttpCode(HttpStatus.OK)
  @Audit({ action: "note.delete", entityType: "Note", entityIdPath: "params.id" })
  remove(@Param("id") id: string) {
    return this.service.softDelete(id);
  }
}
