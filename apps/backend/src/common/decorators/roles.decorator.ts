import { SetMetadata } from "@nestjs/common";
import { UserRole } from "@acoustic-crm/shared";

// Required roles for a route. Read by RolesGuard.
export const ROLES_KEY = "roles";
export const Roles = (...roles: UserRole[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);
