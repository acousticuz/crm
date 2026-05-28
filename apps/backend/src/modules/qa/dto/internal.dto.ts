import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from "class-validator";

export class WriteAnalysisDto {
  @IsString()
  tenantId!: string;

  @IsString()
  callId!: string;

  @IsOptional()
  @IsString()
  sentiment?: string;

  @IsOptional()
  @IsString()
  topic?: string;

  @IsOptional()
  @IsString()
  summary?: string;

  @IsOptional()
  @IsString()
  nextStep?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  keyPoints?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  suggestedTags?: string[];

  @IsOptional()
  @IsString()
  scriptId?: string;
}

export class CriterionResultDto {
  @IsString()
  criterionId!: string;

  @IsBoolean()
  passed!: boolean;

  @IsNumber()
  @Min(0)
  score!: number;

  @IsString()
  evidence!: string;
}

export class WriteQAScoreDto {
  @IsString()
  tenantId!: string;

  @IsString()
  callId!: string;

  @IsString()
  scriptId!: string;

  @IsNumber()
  @Min(0)
  totalScore!: number;

  @IsNumber()
  @Min(0)
  maxScore!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CriterionResultDto)
  criteriaResults!: CriterionResultDto[];
}

export class QaOverrideDto {
  @IsObject()
  override!: Record<string, unknown>;
}
