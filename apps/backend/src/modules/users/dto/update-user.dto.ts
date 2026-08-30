import { IsEmail, IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";
import { UserRole, UserStatus } from "@acoustic-crm/shared";

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  fullName?: string;

  // Login email — editable post-import so admins can replace the
  // auto-generated `2001@acoustic-xxxx.local` from the PBX bulk-create with
  // the operator's real address. Service rejects duplicates within the
  // tenant.
  @IsOptional()
  @IsEmail()
  @MaxLength(180)
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @IsOptional()
  @IsString()
  branchId?: string;

  // Empty string clears the extension; otherwise 2–6 digits.
  @IsOptional()
  @Matches(/^(\d{2,6})?$/, { message: "extension must be 2–6 digits" })
  extension?: string;
}
