import { ConflictException, Injectable } from "@nestjs/common";
import { UserRole } from "@acoustic-crm/shared";
import { PrismaService } from "../prisma/prisma.service";
import { AuthService } from "../auth/auth.service";
import { CreateTenantDto } from "./dto/create-tenant.dto";

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
    return this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: dto.name,
          defaultLanguage: dto.defaultLanguage ?? "uz",
          status: "ACTIVE",
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
      return { tenantId: tenant.id, adminUserId: admin.id };
    });
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
