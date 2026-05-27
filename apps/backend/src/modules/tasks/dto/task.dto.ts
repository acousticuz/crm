import { IsDateString, IsEnum, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { TaskType } from "@acoustic-crm/shared";

export class CreateTaskDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  text!: string;

  @IsDateString()
  dueAt!: string;

  @IsString()
  assigneeId!: string;

  @IsOptional()
  @IsEnum(TaskType)
  type?: TaskType;

  @IsOptional()
  @IsString()
  cardId?: string;

  @IsOptional()
  @IsString()
  contactId?: string;
}

export class UpdateTaskDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  text?: string;

  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @IsOptional()
  @IsString()
  assigneeId?: string;

  @IsOptional()
  @IsEnum(TaskType)
  type?: TaskType;

  @IsOptional()
  @IsDateString()
  completedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  result?: string;
}
