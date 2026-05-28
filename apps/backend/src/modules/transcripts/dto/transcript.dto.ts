import { Type } from "class-transformer";
import {
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from "class-validator";

export class TranscriptSegmentDto {
  @IsString()
  @IsIn(["operator", "customer", "unknown"])
  speaker!: "operator" | "customer" | "unknown";

  @IsNumber()
  @Min(0)
  start!: number;

  @IsNumber()
  @Min(0)
  end!: number;

  @IsString()
  text!: string;
}

export class WriteTranscriptDto {
  @IsString()
  tenantId!: string;

  @IsString()
  callId!: string;

  @IsString()
  text!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TranscriptSegmentDto)
  segments!: TranscriptSegmentDto[];

  @IsOptional()
  @IsString()
  @IsIn(["uz", "ru", "en"])
  language?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number;
}
