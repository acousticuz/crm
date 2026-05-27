import { Body, Controller, Get, NotFoundException, Param, Post, UseGuards } from "@nestjs/common";
import { UserRole } from "@acoustic-crm/shared";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { Audit } from "../../common/decorators/audit.decorator";
import { TenantsService } from "./tenants.service";
import { CreateTenantDto } from "./dto/create-tenant.dto";

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
@Controller("tenants")
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Post()
  @Audit({ action: "tenant.create", entityType: "Tenant", entityIdPath: "result.tenantId" })
  create(@Body() dto: CreateTenantDto) {
    return this.tenants.createWithAdmin(dto);
  }

  @Get()
  list() {
    return this.tenants.list();
  }

  @Get(":id")
  async get(@Param("id") id: string) {
    const t = await this.tenants.findById(id);
    if (!t) {
      throw new NotFoundException("Tenant not found");
    }
    return t;
  }
}
