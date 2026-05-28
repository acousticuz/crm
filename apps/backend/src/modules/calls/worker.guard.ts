import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ClsService } from "nestjs-cls";
import type { Request } from "express";
import { UserRole } from "@acoustic-crm/shared";
import { writeContext } from "../../common/tenant-context";

/**
 * Internal-only guard for endpoints called by `apps/telephony-worker`.
 * Compares the X-Worker-Secret header against TELEPHONY_WORKER_SECRET env;
 * a tenantId in the body sets the CLS context so the Prisma extension still
 * applies to downstream queries.
 */
@Injectable()
export class WorkerGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly cls: ClsService,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    const expected = this.config.get<string>("TELEPHONY_WORKER_SECRET", "");
    if (!expected) {
      throw new UnauthorizedException(
        "TELEPHONY_WORKER_SECRET is not configured on the backend",
      );
    }
    const provided = req.header("x-worker-secret");
    if (!provided || provided !== expected) {
      throw new UnauthorizedException("Invalid worker credentials");
    }
    const body = (req.body ?? {}) as { tenantId?: string };
    if (body.tenantId) {
      writeContext(this.cls, {
        tenantId: body.tenantId,
        userId: null,
        role: UserRole.SUPER_ADMIN,
        email: null,
        skipTenantFilter: false,
      });
    }
    return true;
  }
}
