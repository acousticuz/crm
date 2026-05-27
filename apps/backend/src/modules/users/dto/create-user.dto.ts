import { IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { UserRole } from "@acoustic-crm/shared";

// Tenant-admin can grant any role EXCEPT SUPER_ADMIN.
// Roles enforced again in the service layer.
const ASSIGNABLE_ROLES = [
  UserRole.TENANT_ADMIN,
  UserRole.SUPERVISOR,
  UserRole.OPERATOR,
  UserRole.ANALYST,
] as const;

export class CreateUserDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  fullName!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsEnum(UserRole)
  role!: (typeof ASSIGNABLE_ROLES)[number];

  @IsOptional()
  @IsString()
  branchId?: string;
}
