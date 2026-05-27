import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { ClsService } from "nestjs-cls";
import { createTenantExtension } from "./prisma-tenant.extension";
import { readContext, writeContext } from "../../common/tenant-context";

// PrismaService wraps PrismaClient with the multi-tenant extension wired to
// the per-request CLS context. The extension auto-applies tenantId to every
// query against tenant-scoped models.
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  // Extended client cached after first build; re-used by `tenant` getter.
  private extended: ReturnType<typeof this.buildExtended> | null = null;

  constructor(private readonly cls: ClsService) {
    super();
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this.logger.log("Prisma connected");
    } catch (err) {
      this.logger.warn(`Prisma initial connect failed: ${(err as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Tenant-scoped Prisma client (extension applied). Use `prisma.t.X` for
   * all domain queries — the extension auto-injects tenantId.
   *
   * Access via `prisma.X` directly bypasses the extension and is reserved
   * for clearly unauthenticated bootstrap paths (e.g., login email lookup
   * where no tenantId context exists yet).
   */
  get t(): ReturnType<typeof this.buildExtended> {
    if (!this.extended) {
      this.extended = this.buildExtended();
    }
    return this.extended;
  }

  /**
   * Run a callback as if the caller had SUPER_ADMIN scope (no tenantId
   * injection). Use ONLY for SUPER_ADMIN flows that legitimately span
   * tenants — for example, listing all tenants, or seeding.
   */
  async asSuperAdmin<T>(fn: () => Promise<T>): Promise<T> {
    const previous = readContext(this.cls).skipTenantFilter;
    writeContext(this.cls, { skipTenantFilter: true });
    try {
      return await fn();
    } finally {
      writeContext(this.cls, { skipTenantFilter: previous });
    }
  }

  private buildExtended() {
    return this.$extends(createTenantExtension(this.cls));
  }
}
