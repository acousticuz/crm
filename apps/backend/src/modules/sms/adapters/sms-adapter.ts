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
 * One pre-approved template fetched from the provider. Eskiz and similar
 * services only allow sending messages whose text matches a moderated
 * template, so we mirror their list locally and let operators pick from it.
 */
export interface ProviderTemplate {
  externalId: string;
  body: string;
  // Provider-specific lifecycle marker, e.g. Eskiz "service" (approved),
  // "moderation", or "rejected". Surfaced in the UI so operators only pick
  // sendable ones.
  status: string | null;
}

/**
 * Adapter contract every SMS provider implementation satisfies. New providers
 * can be plugged in by creating a class implementing this interface and
 * registering its name with SmsAdapterFactory.
 */
export interface SmsAdapter {
  readonly name: string;
  send(input: SmsSendInput, providerConfig: Record<string, unknown>): Promise<SmsSendResult>;
  // Optional: providers that publish the tenant's approved-template list
  // (Eskiz does, Play Mobile does not). Returning an empty array is a no-op.
  fetchTemplates?(providerConfig: Record<string, unknown>): Promise<ProviderTemplate[]>;
}
