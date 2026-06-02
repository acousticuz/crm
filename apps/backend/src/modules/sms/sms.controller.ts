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
import { Public } from "../../common/decorators/public.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { Audit } from "../../common/decorators/audit.decorator";
import { SmsService } from "./sms.service";
import {
  CreateSmsTemplateDto,
  SendSmsDto,
  UpdateSmsTemplateDto,
} from "./dto/sms.dto";

@Controller("sms")
export class SmsController {
  constructor(private readonly sms: SmsService) {}

  // ===== Tenant SMS settings (operators need provider + free-text flag) =====

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.TENANT_ADMIN, UserRole.SUPERVISOR, UserRole.OPERATOR, UserRole.ANALYST)
  @Get("settings")
  smsSettings() {
    return this.sms.getOperatorSmsSettings();
  }

  // ===== Templates =====

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.TENANT_ADMIN, UserRole.SUPERVISOR, UserRole.OPERATOR, UserRole.ANALYST)
  @Get("templates")
  listTemplates() {
    return this.sms.listTemplates();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.TENANT_ADMIN, UserRole.SUPERVISOR)
  @Post("templates")
  @Audit({ action: "sms.template.create", entityType: "SmsTemplate", entityIdPath: "result.id" })
  createTemplate(@Body() dto: CreateSmsTemplateDto) {
    return this.sms.createTemplate(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.TENANT_ADMIN, UserRole.SUPERVISOR)
  @Patch("templates/:id")
  @Audit({ action: "sms.template.update", entityType: "SmsTemplate", entityIdPath: "params.id" })
  updateTemplate(@Param("id") id: string, @Body() dto: UpdateSmsTemplateDto) {
    return this.sms.updateTemplate(id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.TENANT_ADMIN, UserRole.SUPERVISOR)
  @Delete("templates/:id")
  @HttpCode(HttpStatus.OK)
  @Audit({ action: "sms.template.delete", entityType: "SmsTemplate", entityIdPath: "params.id" })
  deleteTemplate(@Param("id") id: string) {
    return this.sms.deleteTemplate(id);
  }

  // ===== Manual send =====

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.TENANT_ADMIN, UserRole.SUPERVISOR, UserRole.OPERATOR)
  @Post("send")
  @Audit({ action: "sms.send.manual", entityType: "SmsLog", entityIdPath: "result.id" })
  send(@Body() dto: SendSmsDto) {
    return this.sms.sendManual(dto);
  }

  // ===== Provider template sync =====

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.TENANT_ADMIN)
  @Post("templates/sync")
  @HttpCode(HttpStatus.OK)
  @Audit({ action: "sms.template.sync", entityType: "SmsTemplate" })
  syncTemplates() {
    return this.sms.syncTemplatesFromProvider();
  }

  // ===== Listing =====

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.TENANT_ADMIN, UserRole.SUPERVISOR, UserRole.OPERATOR, UserRole.ANALYST)
  @Get()
  list(@Query("cardId") cardId?: string, @Query("contactId") contactId?: string) {
    if (cardId) return this.sms.listByCard(cardId);
    if (contactId) return this.sms.listByContact(contactId);
    return [];
  }

  // ===== Provider delivery webhook (public, no JWT) =====
  // No secret on this endpoint — delivery webhooks are tied to a specific
  // provider message id we already issued. A bad actor would need to know
  // our internal message ids to forge updates. For prod we'd add per-tenant
  // shared-secret HMAC; deferred to M11.

  @Public()
  @Post("webhook/:tenantId/:provider")
  @HttpCode(HttpStatus.OK)
  webhook(
    @Param("tenantId") tenantId: string,
    @Param("provider") provider: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.sms.handleWebhook(tenantId, provider, body);
  }
}
