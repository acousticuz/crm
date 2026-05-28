import { readFile } from "node:fs/promises";
import { createSign } from "node:crypto";
import type { TranscriptSegment } from "@acoustic-crm/shared";
import type { SttAdapter, SttRequest, SttTranscript } from "./stt-adapter";

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id?: string;
}

interface ChirpResponse {
  error?: { message?: string };
  results?: Array<{ alternatives?: Array<{ transcript?: string; confidence?: number }> }>;
}

interface WavInfo {
  sampleRate: number;
  channels: number;
  bytesPerSample: number;
  dataStart: number;
  dataLen: number;
}

function parseWav(buf: Buffer): WavInfo {
  const channels = buf.readUInt16LE(22) || 1;
  const sampleRate = buf.readUInt32LE(24) || 8000;
  const bitsPerSample = buf.readUInt16LE(34) || 16;
  let off = 12;
  while (off + 8 <= buf.length) {
    const id = buf.toString("ascii", off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === "data") {
      const dataStart = off + 8;
      return {
        sampleRate,
        channels,
        bytesPerSample: bitsPerSample / 8,
        dataStart,
        dataLen: Math.min(size || buf.length - dataStart, buf.length - dataStart),
      };
    }
    off += 8 + size + (size % 2);
  }
  return {
    sampleRate,
    channels,
    bytesPerSample: bitsPerSample / 8,
    dataStart: 44,
    dataLen: Math.max(0, buf.length - 44),
  };
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

const CHUNK_SECONDS = 55;

/**
 * Google Cloud Speech-to-Text v2 with the Chirp model — far better for Uzbek
 * than v1. v2 needs OAuth (API keys are rejected), so we mint an access token
 * from a service-account key via the JWT-bearer flow (no SDK). Long audio is
 * split into <60s chunks (v2 sync recognize limit).
 */
export class GoogleChirpSttAdapter implements SttAdapter {
  readonly name = "google-chirp";
  private token: { value: string; exp: number } | null = null;
  private sa: ServiceAccount | null = null;

  constructor(
    private readonly config: {
      keyPath: string;
      projectId: string;
      region: string;
      model?: string;
      languageCode?: string;
    },
  ) {}

  private async loadSa(): Promise<ServiceAccount> {
    if (this.sa) return this.sa;
    this.sa = JSON.parse(await readFile(this.config.keyPath, "utf8")) as ServiceAccount;
    return this.sa;
  }

  private async accessToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    if (this.token && this.token.exp - 60 > now) return this.token.value;
    const sa = await this.loadSa();
    const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const claims = b64url(
      JSON.stringify({
        iss: sa.client_email,
        scope: "https://www.googleapis.com/auth/cloud-platform",
        aud: "https://oauth2.googleapis.com/token",
        iat: now,
        exp: now + 3600,
      }),
    );
    const signingInput = `${header}.${claims}`;
    const signer = createSign("RSA-SHA256");
    signer.update(signingInput);
    signer.end();
    const jwt = `${signingInput}.${b64url(signer.sign(sa.private_key))}`;
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
    });
    const j = (await res.json()) as { access_token?: string; expires_in?: number; error_description?: string };
    if (!j.access_token) throw new Error(`OAuth token error: ${j.error_description ?? "no token"}`);
    this.token = { value: j.access_token, exp: now + (j.expires_in ?? 3600) };
    return j.access_token;
  }

  private async recognizeChunk(pcm: Buffer, info: WavInfo, token: string): Promise<{ text: string; conf: number }> {
    const region = this.config.region;
    const url = `https://${region}-speech.googleapis.com/v2/projects/${this.config.projectId}/locations/${region}/recognizers/_:recognize`;
    const body = {
      config: {
        model: this.config.model ?? "chirp_2",
        languageCodes: [this.config.languageCode ?? "uz-UZ"],
        explicitDecodingConfig: {
          encoding: "LINEAR16",
          sampleRateHertz: info.sampleRate,
          audioChannelCount: info.channels,
        },
        features: { enableAutomaticPunctuation: true },
      },
      content: pcm.toString("base64"),
    };
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Chirp STT HTTP ${res.status}: ${errText.slice(0, 200)}`);
    }
    const json = (await res.json()) as ChirpResponse;
    if (json.error) throw new Error(`Chirp STT: ${json.error.message}`);
    const results = json.results ?? [];
    const text = results
      .map((r) => r.alternatives?.[0]?.transcript ?? "")
      .filter(Boolean)
      .join(" ")
      .trim();
    const confs = results.map((r) => r.alternatives?.[0]?.confidence ?? 0).filter((c) => c > 0);
    const conf = confs.length ? confs.reduce((a, b) => a + b, 0) / confs.length : 0;
    return { text, conf };
  }

  async transcribe(req: SttRequest): Promise<SttTranscript> {
    if (!req.audioUrl) throw new Error("GoogleChirpSttAdapter: no recording file for this call");
    const token = await this.accessToken();
    const buf = await readFile(req.audioUrl);
    const info = parseWav(buf);
    const bytesPerSecond = info.sampleRate * info.channels * info.bytesPerSample || 16000;
    const chunkBytes = CHUNK_SECONDS * bytesPerSecond;
    const data = buf.subarray(info.dataStart, info.dataStart + info.dataLen);

    const texts: string[] = [];
    const confs: number[] = [];
    for (let off = 0; off < data.length; off += chunkBytes) {
      const { text, conf } = await this.recognizeChunk(data.subarray(off, off + chunkBytes), info, token);
      if (text) texts.push(text);
      if (conf > 0) confs.push(conf);
    }

    const text = texts.join(" ").trim();
    const confidence = confs.length ? confs.reduce((a, b) => a + b, 0) / confs.length : 0.9;
    const segments: TranscriptSegment[] = text ? [{ speaker: "unknown", start: 0, end: 0, text }] : [];
    return { text, segments, language: "uz", confidence };
  }
}
