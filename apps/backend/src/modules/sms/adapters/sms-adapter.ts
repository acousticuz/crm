import type { SmsStatus } from "@acoustic-crm/shared";

// Result of an outbound send attempt at the provider level. The CRM-level
// SmsLog status mirrors this (QUEUED → SENT → DELIVERED, or FAILED).
export interface SmsSendResult {
  status: SmsStatus;
  providerMessageId: string | null;
  errorMessage?: string | null;
}

export interface SmsSendInput {
  phone: string;
  text: string;
}

/**
 * Adapter contract every SMS provider implementation satisfies. New providers
 * can be plugged in by creating a class implementing this interface and
 * registering its name with SmsAdapterFactory.
 */
export interface SmsAdapter {
  readonly name: string;
  send(input: SmsSendInput, providerConfig: Record<string, unknown>): Promise<SmsSendResult>;
}
