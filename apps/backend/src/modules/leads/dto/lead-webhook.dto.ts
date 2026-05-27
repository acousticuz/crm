import { IsEmail, IsOptional, IsString, MaxLength } from "class-validator";

// Webhook payload shape we extract from inbound form posts. Anything else in
// the body is preserved as rawData on the Lead row for later analytics.
export class LeadWebhookDto {
  @IsString()
  @MaxLength(120)
  fullName!: string;

  @IsString()
  @MaxLength(40)
  phone!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;
}
