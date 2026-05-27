import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { ClsService } from "nestjs-cls";
import { UserRole, type JwtPayload } from "@acoustic-crm/shared";
import { writeContext } from "../../../common/tenant-context";

interface RawJwt {
  sub: string;
  tenantId: string;
  role: UserRole;
  email: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, "jwt") {
  constructor(
    config: ConfigService,
    private readonly cls: ClsService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>("JWT_ACCESS_SECRET", "change-me-access-secret"),
    });
  }

  // Called after the access token is verified. Sets the per-request CLS
  // context so the Prisma tenant extension applies tenantId to every query.
  validate(payload: RawJwt): JwtPayload {
    if (!payload.sub || !payload.tenantId || !payload.role) {
      throw new UnauthorizedException("Malformed token");
    }
    writeContext(this.cls, {
      tenantId: payload.tenantId,
      userId: payload.sub,
      role: payload.role,
      email: payload.email,
      skipTenantFilter: false,
    });
    return {
      sub: payload.sub,
      tenantId: payload.tenantId,
      role: payload.role,
      email: payload.email,
    };
  }
}
