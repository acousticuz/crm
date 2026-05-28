import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";

export class ScriptCriterionDto {
  @IsString()
  id!: string;

  @IsString()
  section!: string;

  @IsString()
  @MaxLength(500)
  text!: string;

  @IsNumber()
  @Min(0)
  maxScore!: number;

  // Optional comma-separated keywords the MockLlmAdapter uses for grading.
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  keywords?: string[];
}

export class CreateScriptDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsArray()
  @IsString({ each: true })
  sections!: string[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScriptCriterionDto)
  criteria!: ScriptCriterionDto[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateScriptDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sections?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScriptCriterionDto)
  criteria?: ScriptCriterionDto[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
