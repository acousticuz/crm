import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import { UserRole, type AuthTokens, type JwtPayload } from "@acoustic-crm/shared";
import { PrismaService } from "../prisma/prisma.service";

interface RefreshPayload {
  sub: string;
  tokenType: "refresh";
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  static async hashPassword(plain: string): Promise<string> {
    return argon2.hash(plain, { type: argon2.argon2id });
  }

  static async verifyPassword(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  }

  async login(email: string, password: string): Promise<AuthTokens> {
    // No tenant context is set yet, so the Prisma extension passes through.
    // Email is enforced globally unique at user-creation time (DECISIONS.md).
    const user = await this.prisma.user.findFirst({
      where: { email, deletedAt: null, status: { not: "DISABLED" } },
    });
    if (!user) {
      throw new UnauthorizedException("Invalid credentials");
    }
    const ok = await AuthService.verifyPassword(user.passwordHash, password);
    if (!ok) {
      throw new UnauthorizedException("Invalid credentials");
    }
    return this.issueTokens({
      sub: user.id,
      tenantId: user.tenantId,
      role: user.role as UserRole,
      email: user.email,
    });
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    let decoded: RefreshPayload;
    try {
      decoded = await this.jwt.verifyAsync<RefreshPayload>(refreshToken, {
        secret: this.config.get<string>("JWT_REFRESH_SECRET", "change-me-refresh-secret"),
      });
    } catch {
      throw new UnauthorizedException("Invalid refresh token");
    }
    if (decoded.tokenType !== "refresh") {
      throw new UnauthorizedException("Wrong token type");
    }
    const user = await this.prisma.user.findFirst({
      where: { id: decoded.sub, deletedAt: null, status: { not: "DISABLED" } },
    });
    if (!user) {
      throw new UnauthorizedException("User no longer exists");
    }
    return this.issueTokens({
      sub: user.id,
      tenantId: user.tenantId,
      role: user.role as UserRole,
      email: user.email,
    });
  }

  private async issueTokens(payload: JwtPayload): Promise<AuthTokens> {
    const accessExpiry = this.config.get<string>("JWT_ACCESS_EXPIRES_IN", "15m");
    const refreshExpiry = this.config.get<string>("JWT_REFRESH_EXPIRES_IN", "7d");
    const refreshSecret = this.config.get<string>(
      "JWT_REFRESH_SECRET",
      "change-me-refresh-secret",
    );
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload, { expiresIn: accessExpiry }),
      this.jwt.signAsync(
        { sub: payload.sub, tokenType: "refresh" } satisfies RefreshPayload,
        { secret: refreshSecret, expiresIn: refreshExpiry },
      ),
    ]);
    return { accessToken, refreshToken };
  }
}
