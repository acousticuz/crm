import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { ClsService } from "nestjs-cls";
import { UserRole } from "@acoustic-crm/shared";
import { readContext } from "../../common/tenant-context";
import { PrismaService } from "../prisma/prisma.service";
import { AuthService } from "../auth/auth.service";
import { CallsService } from "../calls/calls.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";

const EXTENSION_RE = /^\d{2,6}$/;

// Stable, safe projection — never expose passwordHash.
const PUBLIC_USER_SELECT = {
  id: true,
  tenantId: true,
  fullName: true,
  email: true,
  role: true,
  branchId: true,
  extension: true,
  status: true,
  isOnline: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
    private readonly calls: CallsService,
  ) {}

  private currentTenantId(): string {
    const tid = readContext(this.cls).tenantId;
    if (!tid) {
      throw new UnauthorizedException("No tenant context");
    }
    return tid;
  }

  /**
   * Provision operator accounts straight from the PBX: pulls the FreePBX
   * extension list and creates an OPERATOR user for every numeric extension not
   * already mapped to someone. Trunks / non-numeric endpoints are skipped. Each
   * new account gets a generated email + one-time temp password (returned once
   * so the admin can hand them out; only the hash is stored).
   */
  async importFromPbx(): Promise<{
    created: Array<{ extension: string; email: string; tempPassword: string }>;
    skippedExisting: string[];
    skippedNonNumeric: string[];
  }> {
    const tenantId = this.currentTenantId();
    const extensions = await this.calls.listPbxExtensions();
    const numeric = extensions.filter((e) => EXTENSION_RE.test(e));
    const skippedNonNumeric = extensions.filter((e) => !EXTENSION_RE.test(e));

    const existing = await this.prisma.t.user.findMany({
      where: { deletedAt: null, extension: { in: numeric } },
      select: { extension: true },
    });
    const taken = new Set(existing.map((u) => u.extension));

    const tenant = await this.prisma.tenant.findFirst({ where: { id: tenantId } });
    const slug =
      (tenant?.name ?? "tenant")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 20) || "tenant";
    const domain = `${slug}-${tenantId.slice(-4)}.local`;

    const created: Array<{ extension: string; email: string; tempPassword: string }> = [];
    const skippedExisting: string[] = [];

    for (const ext of numeric) {
      if (taken.has(ext)) {
        skippedExisting.push(ext);
        continue;
      }
      const tempPassword = `${randomBytes(6).toString("base64url")}A1`;
      const passwordHash = await AuthService.hashPassword(tempPassword);
      // Generated emails are globally unique per tenant; bump a suffix on the
      // rare collision so the import never aborts.
      let email = `op${ext}@${domain}`;
      let suffix = 0;
      while (await this.prisma.user.findFirst({ where: { email } })) {
        suffix += 1;
        email = `op${ext}-${suffix}@${domain}`;
      }
      await this.prisma.t.user.create({
        data: {
          tenantId,
          fullName: `Operator ${ext}`,
          email,
          passwordHash,
          role: "OPERATOR",
          extension: ext,
          status: "ACTIVE",
        },
      });
      created.push({ extension: ext, email, tempPassword });
    }

    return { created, skippedExisting, skippedNonNumeric };
  }

  async create(dto: CreateUserDto) {
    if ((dto.role as UserRole) === UserRole.SUPER_ADMIN) {
      throw new BadRequestException("Cannot create SUPER_ADMIN via this endpoint");
    }
    // Global email uniqueness via base client (no tenant injection).
    const taken = await this.prisma.user.findFirst({ where: { email: dto.email } });
    if (taken) {
      throw new ConflictException("Email already in use");
    }
    const passwordHash = await AuthService.hashPassword(dto.password);
    const tenantId = this.currentTenantId();
    return this.prisma.t.user.create({
      data: {
        tenantId,
        fullName: dto.fullName,
        email: dto.email,
        passwordHash,
        role: dto.role,
        branchId: dto.branchId ?? null,
        extension: dto.extension ?? null,
        status: "ACTIVE",
      },
      select: PUBLIC_USER_SELECT,
    });
  }

  list() {
    return this.prisma.t.user.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: PUBLIC_USER_SELECT,
    });
  }

  async findById(id: string) {
    const user = await this.prisma.t.user.findFirst({
      where: { id, deletedAt: null },
      select: PUBLIC_USER_SELECT,
    });
    if (!user) {
      throw new NotFoundException("User not found");
    }
    return user;
  }

  async update(id: string, dto: UpdateUserDto) {
    // findFirst (not findUnique) so the extension's tenantId filter applies.
    const existing = await this.prisma.t.user.findFirst({ where: { id, deletedAt: null } });
    if (!existing) {
      throw new NotFoundException("User not found");
    }
    if (dto.role && (dto.role as UserRole) === UserRole.SUPER_ADMIN) {
      throw new BadRequestException("Cannot grant SUPER_ADMIN via this endpoint");
    }
    const data: Record<string, unknown> = {};
    if (dto.fullName !== undefined) data.fullName = dto.fullName;
    if (dto.role !== undefined) data.role = dto.role;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.branchId !== undefined) data.branchId = dto.branchId;
    // Empty string clears the extension (sets null).
    if (dto.extension !== undefined) data.extension = dto.extension || null;
    if (dto.password) {
      data.passwordHash = await AuthService.hashPassword(dto.password);
    }
    // Email change — supports replacing the auto-generated PBX-import email
    // (`2001@acoustic-xxxx.local`) with the operator's real address.
    // Cross-tenant uniqueness is enforced because emails are the login
    // credential — two users with the same email would collide at auth time.
    if (dto.email !== undefined && dto.email.toLowerCase() !== existing.email.toLowerCase()) {
      const taken = await this.prisma.user.findFirst({
        where: { email: dto.email, deletedAt: null, NOT: { id } },
        select: { id: true },
      });
      if (taken) {
        throw new BadRequestException("Email allaqachon ishlatilmoqda");
      }
      data.email = dto.email;
    }
    return this.prisma.t.user.update({
      where: { id },
      data,
      select: PUBLIC_USER_SELECT,
    });
  }

  async softDelete(id: string): Promise<{ id: string }> {
    const existing = await this.prisma.t.user.findFirst({ where: { id, deletedAt: null } });
    if (!existing) {
      throw new NotFoundException("User not found");
    }
    await this.prisma.t.user.update({
      where: { id },
      data: { deletedAt: new Date(), status: "DISABLED" },
    });
    return { id };
  }
}
