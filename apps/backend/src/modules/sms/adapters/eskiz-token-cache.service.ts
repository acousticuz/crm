import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

/**
 * Server-managed Eskiz JWT cache. Tokens last ~30 days, so re-logging in on
 * every send is wasteful (and rate-limited). Cache survives process restarts
 * via the `eskiz_token_cache` table (one row per tenant). Never logged.
 */
@Injectable()
export class EskizTokenCacheService {
  private readonly logger = new Logger(EskizTokenCacheService.name);

  constructor(private readonly prisma: PrismaService) {}

  async read(tenantId: string): Promise<{ token: string; expiresAt: Date } | null> {
    const row = await this.prisma.eskizTokenCache.findUnique({
      where: { tenantId },
      select: { token: true, expiresAt: true },
    });
    return row ?? null;
  }

  async write(tenantId: string, token: string, expiresAt: Date): Promise<void> {
    await this.prisma.eskizTokenCache.upsert({
      where: { tenantId },
      create: { tenantId, token, expiresAt },
      update: { token, expiresAt },
    });
  }

  async clear(tenantId: string): Promise<void> {
    await this.prisma.eskizTokenCache.deleteMany({ where: { tenantId } });
  }
}
