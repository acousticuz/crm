import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { ClsService } from "nestjs-cls";
import { UserRole } from "@acoustic-crm/shared";
import { readContext } from "../../common/tenant-context";
import { PrismaService } from "../prisma/prisma.service";
import { AuthService } from "../auth/auth.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";

// Stable, safe projection — never expose passwordHash.
const PUBLIC_USER_SELECT = {
  id: true,
  tenantId: true,
  fullName: true,
  email: true,
  role: true,
  branchId: true,
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
  ) {}

  private currentTenantId(): string {
    const tid = readContext(this.cls).tenantId;
    if (!tid) {
      throw new UnauthorizedException("No tenant context");
    }
    return tid;
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
    if (dto.password) {
      data.passwordHash = await AuthService.hashPassword(dto.password);
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
