import { IsEmail, IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";
import { UserRole } from "@acoustic-crm/shared";

// Tenant-admin can grant any role EXCEPT SUPER_ADMIN.
// Roles enforced again in the service layer.
type AssignableRole =
  | UserRole.TENANT_ADMIN
  | UserRole.SUPERVISOR
  | UserRole.OPERATOR
  | UserRole.ANALYST;

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
  role!: AssignableRole;

  @IsOptional()
  @IsString()
  branchId?: string;

  // Operator's PJSIP extension on the PBX — digits only (2–6 chars).
  @IsOptional()
  @Matches(/^\d{2,6}$/, { message: "extension must be 2–6 digits" })
  extension?: string;
}
