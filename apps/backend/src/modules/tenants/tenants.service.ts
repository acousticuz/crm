import { ConflictException, Injectable } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { UserRole } from "@acoustic-crm/shared";
import { PrismaService } from "../prisma/prisma.service";
import { AuthService } from "../auth/auth.service";
import { CreateTenantDto } from "./dto/create-tenant.dto";

// Default Kanban setup created together with each new tenant so the
// lead-acceptance flow (M2) always has a place to drop Cards. Admins can
// rename/reorder/recolor these in M3.
const DEFAULT_STAGES: ReadonlyArray<{
  name: string;
  order: number;
  color: string;
  type: "NORMAL" | "WON" | "LOST";
}> = [
  { name: "Yangi", order: 0, color: "#0ea5e9", type: "NORMAL" },
  { name: "Bog'lanildi", order: 1, color: "#22c55e", type: "NORMAL" },
  { name: "Taklif yuborildi", order: 2, color: "#f59e0b", type: "NORMAL" },
  { name: "Yutdi", order: 3, color: "#16a34a", type: "WON" },
  { name: "Yo'qotdi", order: 4, color: "#dc2626", type: "LOST" },
];

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates a tenant together with its initial TENANT_ADMIN user atomically.
   * Spans tenants, so callers must be SUPER_ADMIN; the Prisma extension is
   * bypassed via asSuperAdmin so we control tenantId explicitly.
   */
  async createWithAdmin(dto: CreateTenantDto): Promise<{ tenantId: string; adminUserId: string }> {
    // Check email is not used anywhere — enforces a global uniqueness
    // invariant so /auth/login by email alone is unambiguous (DECISIONS.md).
    // Use raw `prisma.user` (base client) so no tenantId is injected.
    const emailTaken = await this.prisma.user.findFirst({
      where: { email: dto.adminEmail },
    });
    if (emailTaken) {
      throw new ConflictException("Email already in use");
    }

    const passwordHash = await AuthService.hashPassword(dto.adminPassword);

    // Cross-tenant write: use base $transaction directly. The Tenant model is
    // not tenant-scoped; the new User row carries the tenantId we just made.
    // Also seed a default Pipeline + Stages so lead-acceptance has a target.
    const webhookSecret = randomBytes(24).toString("hex");
    return this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: dto.name,
          defaultLanguage: dto.defaultLanguage ?? "uz",
          status: "ACTIVE",
          settings: { webhookSecret },
        },
      });
      const admin = await tx.user.create({
        data: {
          tenantId: tenant.id,
          fullName: dto.adminFullName,
          email: dto.adminEmail,
          passwordHash,
          role: UserRole.TENANT_ADMIN,
          status: "ACTIVE",
        },
      });
      const pipeline = await tx.pipeline.create({
        data: {
          tenantId: tenant.id,
          name: "Sotuv",
          isDefault: true,
          order: 0,
        },
      });
      await tx.stage.createMany({
        data: DEFAULT_STAGES.map((s) => ({
          tenantId: tenant.id,
          pipelineId: pipeline.id,
          name: s.name,
          order: s.order,
          color: s.color,
          type: s.type,
        })),
      });
      return {
        tenantId: tenant.id,
        adminUserId: admin.id,
        pipelineId: pipeline.id,
        webhookSecret,
      };
    });
  }

  /**
   * Returns the tenant's webhook secret used to authenticate public lead
   * intake webhooks. Stored in Tenant.settings.webhookSecret JSON column.
   * Looked up via base prisma (no tenant context yet on webhook entry).
   */
  async getWebhookSecret(tenantId: string): Promise<string | null> {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
      select: { settings: true, status: true },
    });
    if (!tenant || tenant.status !== "ACTIVE") {
      return null;
    }
    const settings = tenant.settings as Record<string, unknown> | null;
    const secret = settings?.webhookSecret;
    return typeof secret === "string" ? secret : null;
  }

  list() {
    return this.prisma.t.tenant.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        status: true,
        defaultLanguage: true,
        createdAt: true,
      },
    });
  }

  async findById(id: string) {
    return this.prisma.t.tenant.findFirst({ where: { id, deletedAt: null } });
  }
}
