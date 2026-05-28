import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, IsString, Min, ValidateNested } from "class-validator";
import { TenantStatus } from "@acoustic-crm/shared";

export class SetTenantStatusDto {
  @IsEnum(TenantStatus)
  status!: TenantStatus;
}

export class SetTenantLimitsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxUsers?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxCallsPerMonth?: number;
}

export class DefaultLimitsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxUsers?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxCallsPerMonth?: number;
}

export class PlatformSettingsDto {
  @IsOptional()
  @IsString()
  defaultSttProvider?: string;

  @IsOptional()
  @IsString()
  defaultLlmProvider?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => DefaultLimitsDto)
  defaultLimits?: DefaultLimitsDto;
}
