import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";

// AES-256-GCM secret encryption for integration credentials (AMI secret,
// SMS API key, Telegram bot token, Page access token). The key is derived
// from the ENCRYPTION_KEY env via scrypt so any-length input yields a fixed
// 32-byte key. Ciphertext format (base64 segments joined by ':'):
//   <iv>:<authTag>:<ciphertext>
//
// SECURITY: ENCRYPTION_KEY must be set in production and kept out of git.
// Rotating it invalidates existing ciphertexts (re-enter integration creds).

const ALGO = "aes-256-gcm";
const IV_LEN = 12; // GCM standard nonce length
const SALT = "acoustic-crm:integration-secrets:v1";

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw || raw.length < 16) {
    throw new Error(
      "ENCRYPTION_KEY env must be set (>=16 chars) to encrypt integration secrets",
    );
  }
  cachedKey = scryptSync(raw, SALT, 32);
  return cachedKey;
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(
    ":",
  );
}

export function decryptSecret(payload: string): string {
  const parts = payload.split(":");
  if (parts.length !== 3) {
    throw new Error("Malformed ciphertext");
  }
  const [ivB64, tagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");
  const decipher = createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

/** Returns true if the string looks like our iv:tag:cipher format. */
export function isEncrypted(value: unknown): value is string {
  return typeof value === "string" && value.split(":").length === 3;
}

/**
 * Masks a secret for safe display — shows only the last 4 chars.
 * "supersecret1234" → "••••••1234". Short secrets are fully masked.
 */
export function maskSecret(plaintext: string): string {
  if (!plaintext) return "";
  if (plaintext.length <= 4) return "••••";
  return `••••••${plaintext.slice(-4)}`;
}
