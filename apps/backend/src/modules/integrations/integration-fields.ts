import { IntegrationType } from "@acoustic-crm/shared";

// Which config keys are secret (encrypted at rest, masked in responses) per
// integration type. Any key NOT listed here is stored in clear and returned
// to the frontend as-is. Keep this in sync with the DTOs and the UI forms.
export const SECRET_FIELDS: Record<IntegrationType, string[]> = {
  [IntegrationType.FREEPBX]: ["amiSecret"],
  [IntegrationType.SMS]: ["apiKey", "password"],
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
  [IntegrationType.SMS]: ["provider", "login", "sender"],
  [IntegrationType.TELEGRAM]: ["webhookUrl", "purpose"],
  [IntegrationType.INBOX]: ["provider", "pageId", "pageName"],
};

export function allowedFields(type: IntegrationType): string[] {
  return [...PUBLIC_FIELDS[type], ...SECRET_FIELDS[type]];
}
