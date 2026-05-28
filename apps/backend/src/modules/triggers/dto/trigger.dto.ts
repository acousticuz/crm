import { IsBoolean, IsObject, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateTriggerDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsObject()
  event!: { type: string; [k: string]: unknown };

  @IsOptional()
  @IsObject()
  conditions?: Record<string, unknown>;

  @IsObject({ each: false })
  actions!: Array<Record<string, unknown>>;

  @IsOptional()
  @IsString()
  pipelineId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateTriggerDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsObject()
  event?: { type: string; [k: string]: unknown };

  @IsOptional()
  @IsObject()
  conditions?: Record<string, unknown>;

  @IsOptional()
  actions?: Array<Record<string, unknown>>;

  @IsOptional()
  @IsString()
  pipelineId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
