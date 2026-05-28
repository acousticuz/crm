import { IsArray, IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class InboxWebhookDto {
  // The external thread id from the channel (Instagram/Facebook
  // conversation id, FB comment thread id, etc.).
  @IsString()
  externalThreadId!: string;

  @IsString()
  externalMessageId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  text!: string;

  @IsOptional()
  @IsString()
  senderName?: string;

  @IsOptional()
  @IsString()
  senderHandle?: string;

  @IsOptional()
  @IsString()
  contactPhone?: string;
}

export class ApproveDraftDto {
  // Allow the operator to edit the draft before sending.
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  text?: string;
}

export class RejectDraftDto {
  @IsString()
  @MaxLength(500)
  reason!: string;
}

export class SendManualMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  text!: string;
}

export class ListThreadsQueryDto {
  @IsOptional()
  @IsString()
  @IsIn(["OPEN", "CLOSED", "ALL"])
  status?: "OPEN" | "CLOSED" | "ALL";

  @IsOptional()
  @IsString()
  channel?: string;
}

export interface InboxThreadDto {
  id: string;
  channel: string;
  contactId: string | null;
  status: string;
  lastMessageAt: string;
}

export interface InboxMessageDto {
  id: string;
  direction: string;
  sender: string;
  text: string;
  status: string;
  sensitiveCategories: string[];
  approvedBy: string | null;
  rejectionReason: string | null;
  sentAt: string | null;
  createdAt: string;
}

export interface ApprovableDraftListItem {
  threadId: string;
  channel: string;
  message: InboxMessageDto;
}
