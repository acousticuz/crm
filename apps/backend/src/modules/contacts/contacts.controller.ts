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
import { ContactsService } from "./contacts.service";
import { CreateContactDto } from "./dto/create-contact.dto";
import { UpdateContactDto } from "./dto/update-contact.dto";
import { FindContactsDto } from "./dto/find-contacts.dto";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("contacts")
export class ContactsController {
  constructor(private readonly contacts: ContactsService) {}

  @Roles(UserRole.TENANT_ADMIN, UserRole.SUPERVISOR, UserRole.OPERATOR)
  @Post()
  @Audit({ action: "contact.create", entityType: "Contact", entityIdPath: "result.id" })
  create(@Body() dto: CreateContactDto) {
    return this.contacts.create(dto);
  }

  @Roles(UserRole.TENANT_ADMIN, UserRole.SUPERVISOR, UserRole.OPERATOR, UserRole.ANALYST)
  @Get()
  list(@Query() query: FindContactsDto) {
    return this.contacts.list(query);
  }

  // Duplicate-detection endpoint used by the UI before insert.
  @Roles(UserRole.TENANT_ADMIN, UserRole.SUPERVISOR, UserRole.OPERATOR)
  @Get("check")
  check(@Query("phone") phone: string) {
    return this.contacts.findByPhones([phone]);
  }

  @Roles(UserRole.TENANT_ADMIN, UserRole.SUPERVISOR, UserRole.OPERATOR, UserRole.ANALYST)
  @Get(":id")
  get(@Param("id") id: string) {
    return this.contacts.findById(id);
  }

  @Roles(UserRole.TENANT_ADMIN, UserRole.SUPERVISOR, UserRole.OPERATOR)
  @Patch(":id")
  @Audit({ action: "contact.update", entityType: "Contact", entityIdPath: "params.id" })
  update(@Param("id") id: string, @Body() dto: UpdateContactDto) {
    return this.contacts.update(id, dto);
  }

  @Roles(UserRole.TENANT_ADMIN, UserRole.SUPERVISOR)
  @Delete(":id")
  @HttpCode(HttpStatus.OK)
  @Audit({ action: "contact.delete", entityType: "Contact", entityIdPath: "params.id" })
  remove(@Param("id") id: string) {
    return this.contacts.softDelete(id);
  }
}
