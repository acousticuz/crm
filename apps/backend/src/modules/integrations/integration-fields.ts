import { IntegrationType } from "@acoustic-crm/shared";

// Which config keys are secret (encrypted at rest, masked in responses) per
// integration type. Any key NOT listed here is stored in clear and returned
// to the frontend as-is. Keep this in sync with the DTOs and the UI forms.
export const SECRET_FIELDS: Record<IntegrationType, string[]> = {
  [IntegrationType.FREEPBX]: ["amiSecret"],
  // Eskiz auth: login/password in the current UI. apiKey remains accepted as
  // a legacy encrypted alias for Eskiz's secret key.
  [IntegrationType.SMS]: ["password", "apiKey"],
  [IntegrationType.TELEGRAM]: ["botToken"],
  [IntegrationType.INBOX]: ["pageAccessToken"],
};

// Non-secret keys we accept per type — used to whitelist input so we don't
// persist arbitrary fields. Secret keys are appended automatically.
export const PUBLIC_FIELDS: Record<IntegrationType, string[]> = {
  [IntegrationType.FREEPBX]: [
    "amiHost",
    "amiPort",
    "amiUsername",
    "cdrMode",
    "recordingsSource",
  ],
  [IntegrationType.SMS]: ["provider", "login", "sender", "allowFreeText"],
  [IntegrationType.TELEGRAM]: [
    "webhookUrl",
    "purpose",
    "chatId",
    // Inbound message capture — picks between Telegram pushing to our HTTPS
    // webhook ("webhook") and us polling Telegram getUpdates ("polling").
    // "off" disables inbound entirely; the tenant only uses outbound
    // notifications. inboundOffset is server-managed (last processed
    // update_id) for the polling driver; admins should leave it alone.
    "inboundMode",
    "inboundWebhookUrl",
    "inboundOffset",
  ],
  [IntegrationType.INBOX]: ["provider", "pageId", "pageName"],
};

export function allowedFields(type: IntegrationType): string[] {
  return [...PUBLIC_FIELDS[type], ...SECRET_FIELDS[type]];
}
