import { Injectable, Logger } from "@nestjs/common";
import { ClsService } from "nestjs-cls";
import { readContext } from "../../common/tenant-context";
import { PrismaService } from "../prisma/prisma.service";

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId: string;
  details?: Record<string, unknown>;
  // Override the actor user (defaults to CLS context).
  userId?: string;
  // Override the tenant scope (defaults to CLS context). When the actor is
  // SUPER_ADMIN creating a tenant, the log is written under their own tenant.
  tenantId?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  async log(entry: AuditEntry): Promise<void> {
    const ctx = readContext(this.cls);
    const tenantId = entry.tenantId ?? ctx.tenantId;
    const userId = entry.userId ?? ctx.userId;
    if (!tenantId) {
      // Should not happen on guarded routes — log and skip.
      this.logger.warn(`Audit skipped (no tenant): ${entry.action} ${entry.entityType}`);
      return;
    }
    try {
      // Use base prisma.auditLog (skip extension) and pass tenantId explicitly,
      // so super-admin cross-tenant writes don't accidentally re-route.
      await this.prisma.auditLog.create({
        data: {
          tenantId,
          userId: userId ?? null,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId,
          details: (entry.details ?? {}) as object,
        },
      });
    } catch (err) {
      // Audit writes never fail the user request — log and move on.
      this.logger.error(
        `Failed to write audit log for ${entry.action}: ${(err as Error).message}`,
      );
    }
  }
}
