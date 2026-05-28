import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { ClsService } from "nestjs-cls";
import type { Request } from "express";
import { UserRole } from "@acoustic-crm/shared";
import { writeContext } from "../../common/tenant-context";
import { TenantsService } from "../tenants/tenants.service";

/**
 * Reuses the tenant webhook-secret scheme from lead intake. Inbox webhooks
 * mount at `/api/v1/internal/inbox/webhook/:tenantId/:channel` and carry
 * the secret in `X-Webhook-Secret`. Sets CLS context so downstream Prisma
 * queries are tenant-scoped.
 */
@Injectable()
export class InboxWebhookGuard implements CanActivate {
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
