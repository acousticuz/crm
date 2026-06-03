import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { ClsService } from "nestjs-cls";
import type { Request } from "express";
import { UserRole } from "@acoustic-crm/shared";
import { writeContext } from "../../common/tenant-context";
import { TenantsService } from "../tenants/tenants.service";

/**
 * Validates inbound Telegram webhook requests. Telegram supports a per-bot
 * `secret_token` registered via setWebhook; it then echoes the value back in
 * the `X-Telegram-Bot-Api-Secret-Token` header on every push. Tenants
 * register that secret to the bot using their own webhookSecret, so the same
 * one-secret-per-tenant story used elsewhere keeps working.
 *
 * Also accepts `X-Webhook-Secret` for parity with the rest of our webhook
 * surfaces (lead, inbox/facebook) — useful when sharing one secret store.
 */
@Injectable()
export class TelegramWebhookGuard implements CanActivate {
  constructor(
    private readonly tenants: TenantsService,
    private readonly cls: ClsService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const params = req.params as Record<string, string | undefined>;
    const tenantId = params.tenantId;
    const tg = req.header("x-telegram-bot-api-secret-token");
    const generic = req.header("x-webhook-secret");
    const provided = (tg ?? generic ?? "").trim();
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
