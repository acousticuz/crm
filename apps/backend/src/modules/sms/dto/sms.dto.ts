import { IsObject, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateSmsTemplateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  body!: string;
}

export class UpdateSmsTemplateDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  body?: string;
}

export class SendSmsDto {
  @IsString()
  phone!: string;

  @IsOptional()
  @IsString()
  templateId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  text?: string;

  @IsOptional()
  @IsObject()
  variables?: Record<string, string | number>;

  @IsOptional()
  @IsString()
  cardId?: string;

  @IsOptional()
  @IsString()
  contactId?: string;
}
