import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from "class-validator";
import { CallDirection, CallStatus } from "@acoustic-crm/shared";

export class CallIncomingDto {
  @IsString()
  tenantId!: string;

  @IsString()
  cdrUniqueId!: string;

  @IsString()
  fromNumber!: string;

  @IsString()
  toNumber!: string;

  @IsOptional()
  @IsString()
  operatorId?: string;
}

export class CallStartedDto {
  @IsString()
  tenantId!: string;

  @IsString()
  cdrUniqueId!: string;

  @IsEnum(CallDirection)
  direction!: CallDirection;

  @IsString()
  fromNumber!: string;

  @IsString()
  toNumber!: string;

  @IsOptional()
  @IsString()
  operatorId?: string;

  @IsOptional()
  @IsDateString()
  startedAt?: string;
}

export class CallCompletedDto {
  @IsString()
  tenantId!: string;

  @IsString()
  cdrUniqueId!: string;

  @IsEnum(CallDirection)
  direction!: CallDirection;

  @IsString()
  fromNumber!: string;

  @IsString()
  toNumber!: string;

  @IsOptional()
  @IsString()
  operatorId?: string;

  @IsEnum(CallStatus)
  status!: CallStatus;

  @IsDateString()
  startedAt!: string;

  @IsInt()
  @Min(0)
  duration!: number;

  @IsOptional()
  @IsString()
  recordingUrl?: string;
}

export class OriginateCallDto {
  @IsString()
  toNumber!: string;

  @IsOptional()
  @IsString()
  cardId?: string;

  @IsOptional()
  @IsString()
  contactId?: string;
}
