import { Body, Controller, Get, Put, UseGuards } from "@nestjs/common";
import { UserRole } from "@acoustic-crm/shared";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { Audit } from "../../common/decorators/audit.decorator";
import { TenantsService } from "./tenants.service";
import { PlatformSettingsDto } from "./dto/admin.dto";

// Platform-level defaults (default STT/LLM provider, default limits). Stored
// on the __system__ tenant settings. SUPER_ADMIN only.
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
@Controller("platform/settings")
export class PlatformController {
  constructor(private readonly tenants: TenantsService) {}

  @Get()
  get() {
    return this.tenants.getPlatformSettings();
  }

  @Put()
  @Audit({ action: "platform.settings.update", entityType: "Platform", entityIdPath: "body.defaultSttProvider" })
  set(@Body() dto: PlatformSettingsDto) {
    return this.tenants.setPlatformSettings(dto);
  }
}
