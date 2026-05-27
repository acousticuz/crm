import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { JwtPayload } from "@acoustic-crm/shared";

// Attached to req.user by JwtStrategy.validate().
export const CurrentUser = createParamDecorator((_, ctx: ExecutionContext): JwtPayload => {
  const req = ctx.switchToHttp().getRequest<{ user: JwtPayload }>();
  return req.user;
});
