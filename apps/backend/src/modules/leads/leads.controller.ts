import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { UserRole } from "@acoustic-crm/shared";
import { Public } from "../../common/decorators/public.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { Audit } from "../../common/decorators/audit.decorator";
import { LeadsService } from "./leads.service";
import { WebhookGuard } from "./webhook.guard";
import { LeadWebhookDto } from "./dto/lead-webhook.dto";
import { FindLeadsDto } from "./dto/find-leads.dto";

@Controller("leads")
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  // Public lead intake. WebhookGuard validates the X-Webhook-Secret header
  // against Tenant.settings.webhookSecret and sets CLS scope to the tenant.
  @Public()
  @UseGuards(WebhookGuard)
  @Post("webhook/:tenantId/:source")
  @HttpCode(HttpStatus.CREATED)
  webhook(
    @Param("source") source: string,
    @Body() dto: LeadWebhookDto,
    @Req() req: Request,
  ) {
    return this.leads.createFromWebhook(source, dto, req.body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.TENANT_ADMIN, UserRole.SUPERVISOR, UserRole.OPERATOR, UserRole.ANALYST)
  @Get()
  list(@Query() query: FindLeadsDto) {
    return this.leads.list(query);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.TENANT_ADMIN, UserRole.SUPERVISOR, UserRole.OPERATOR)
  @Get("unsorted")
  unsorted(@Query() query: FindLeadsDto) {
    return this.leads.unsorted(query);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.TENANT_ADMIN, UserRole.SUPERVISOR, UserRole.OPERATOR, UserRole.ANALYST)
  @Get(":id")
  get(@Param("id") id: string) {
    return this.leads.findById(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.TENANT_ADMIN, UserRole.SUPERVISOR, UserRole.OPERATOR)
  @Post(":id/accept")
  @HttpCode(HttpStatus.OK)
  @Audit({ action: "lead.accept", entityType: "Lead", entityIdPath: "params.id" })
  accept(@Param("id") id: string) {
    return this.leads.accept(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.TENANT_ADMIN, UserRole.SUPERVISOR, UserRole.OPERATOR)
  @Post(":id/reject")
  @HttpCode(HttpStatus.OK)
  @Audit({ action: "lead.reject", entityType: "Lead", entityIdPath: "params.id" })
  reject(@Param("id") id: string) {
    return this.leads.reject(id);
  }
}
