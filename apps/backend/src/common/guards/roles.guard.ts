import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { UserRole, type JwtPayload } from "@acoustic-crm/shared";
import { ROLES_KEY } from "../decorators/roles.decorator";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) {
      return true;
    }
    const req = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    const user = req.user;
    if (!user) {
      throw new ForbiddenException("Unauthenticated");
    }
    // SUPER_ADMIN always passes role checks (system-wide override).
    if (user.role === UserRole.SUPER_ADMIN) {
      return true;
    }
    if (!required.includes(user.role)) {
      throw new ForbiddenException(`Role ${user.role} is not permitted for this resource`);
    }
    return true;
  }
}
