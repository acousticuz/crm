import { IsEnum, IsHexColor, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from "class-validator";
import { StageType } from "@acoustic-crm/shared";

export class CreateStageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @IsInt()
  @Min(0)
  order!: number;

  @IsOptional()
  @IsHexColor()
  color?: string;

  @IsOptional()
  @IsEnum(StageType)
  type?: StageType;
}

export class UpdateStageDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  @IsOptional()
  @IsHexColor()
  color?: string;

  @IsOptional()
  @IsEnum(StageType)
  type?: StageType;
}
