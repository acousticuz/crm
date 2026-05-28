import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  Post,
  Put,
  UseGuards,
} from "@nestjs/common";
import { IntegrationType, UserRole } from "@acoustic-crm/shared";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { IntegrationsService } from "./integrations.service";
import { UpsertIntegrationDto } from "./dto/integration.dto";

// Settings → Integrations. TENANT_ADMIN only (security rule 5.11.3 #3).
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.TENANT_ADMIN)
@Controller("integrations")
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Get()
  list() {
    return this.integrations.list();
  }

  @Get(":type")
  get(@Param("type", new ParseEnumPipe(IntegrationType)) type: IntegrationType) {
    return this.integrations.get(type);
  }

  @Put(":type")
  upsert(
    @Param("type", new ParseEnumPipe(IntegrationType)) type: IntegrationType,
    @Body() dto: UpsertIntegrationDto,
  ) {
    return this.integrations.upsert(type, dto);
  }

  @Post(":type/test")
  @HttpCode(HttpStatus.OK)
  test(@Param("type", new ParseEnumPipe(IntegrationType)) type: IntegrationType) {
    return this.integrations.test(type);
  }

  @Post(":type/disconnect")
  @HttpCode(HttpStatus.OK)
  disconnect(@Param("type", new ParseEnumPipe(IntegrationType)) type: IntegrationType) {
    return this.integrations.disconnect(type);
  }
}
