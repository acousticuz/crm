// Phone number normalization for Uzbek callcenter context.
//
// Examples:
//   "+998 90 123 45 67" → "+998901234567"
//   "998 90-123-45-67"  → "+998901234567"
//   "90 123 45 67"      → "+998901234567"
//   "+1 555 1234"       → "+15551234"
//
// Throws if the input is empty after cleaning.

export function normalizePhone(input: string): string {
  const cleaned = input.trim().replace(/[^\d+]/g, "");
  if (!cleaned) {
    throw new Error("Empty phone number");
  }
  if (cleaned.startsWith("+")) {
    return cleaned;
  }
  if (cleaned.startsWith("998")) {
    return `+${cleaned}`;
  }
  // Uzbek mobile/landline: 9-digit local number → assume +998 country code.
  if (cleaned.length === 9) {
    return `+998${cleaned}`;
  }
  return `+${cleaned}`;
}

export function normalizePhones(phones: string[]): string[] {
  return Array.from(new Set(phones.map((p) => normalizePhone(p))));
}

/**
 * Non-throwing variant. Returns null when the input has no usable digits —
 * useful for telephony events (Asterisk emits internal/Local channels with
 * empty caller IDs that aren't real customer numbers).
 */
export function tryNormalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const cleaned = input.trim().replace(/[^\d+]/g, "");
  if (!cleaned || cleaned === "+") return null;
  // Reject obviously non-dialable values (e.g. single digit feature codes).
  if (cleaned.replace(/\D/g, "").length < 3) return null;
  try {
    return normalizePhone(input);
  } catch {
    return null;
  }
}
