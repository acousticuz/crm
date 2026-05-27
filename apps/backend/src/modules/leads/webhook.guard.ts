import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { ClsService } from "nestjs-cls";
import type { Request } from "express";
import { UserRole } from "@acoustic-crm/shared";
import { writeContext } from "../../common/tenant-context";
import { TenantsService } from "../tenants/tenants.service";

/**
 * Authenticates public lead webhooks via X-Webhook-Secret header against the
 * tenant's stored secret. On success, populates the CLS context so the
 * Prisma extension scopes downstream queries correctly.
 */
@Injectable()
export class WebhookGuard implements CanActivate {
  constructor(
    private readonly tenants: TenantsService,
    private readonly cls: ClsService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const params = req.params as Record<string, string | undefined>;
    const tenantId = params.tenantId;
    const provided = req.header("x-webhook-secret");
    if (!tenantId || !provided) {
      throw new UnauthorizedException("Missing webhook credentials");
    }
    const expected = await this.tenants.getWebhookSecret(tenantId);
    if (!expected || provided !== expected) {
      throw new UnauthorizedException("Invalid webhook credentials");
    }
    // Run as the tenant's own scope. Use TENANT_ADMIN role so any RBAC
    // checks downstream pass on its behalf.
    writeContext(this.cls, {
      tenantId,
      userId: null,
      role: UserRole.TENANT_ADMIN,
      email: null,
      skipTenantFilter: false,
    });
    return true;
  }
}
