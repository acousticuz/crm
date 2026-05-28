import { readFile } from "node:fs/promises";
import type { TranscriptSegment } from "@acoustic-crm/shared";
import type { SttAdapter, SttRequest, SttTranscript } from "./stt-adapter";

interface GoogleRecognizeResponse {
  results?: Array<{
    alternatives?: Array<{ transcript?: string; confidence?: number }>;
  }>;
}

function toLang(code?: string): "uz" | "ru" | "en" {
  const l = (code ?? "uz").slice(0, 2).toLowerCase();
  if (l === "ru") return "ru";
  if (l === "en") return "en";
  return "uz";
}

/**
 * Google Cloud Speech-to-Text (v1) adapter. Uzbek ("uz-UZ") is officially
 * supported, which OpenAI's models handle poorly. Uses the synchronous
 * recognize endpoint with API-key auth — fine for short call recordings
 * (<~60s). encoding/sampleRate are omitted so Google reads the WAV header.
 */
export class GoogleSttAdapter implements SttAdapter {
  readonly name = "google";

  constructor(
    private readonly config: {
      apiKey: string;
      languageCode?: string;
      alternativeLanguageCodes?: string[];
    },
  ) {}

  async transcribe(req: SttRequest): Promise<SttTranscript> {
    if (!req.audioUrl) {
      throw new Error("GoogleSttAdapter: no recording file resolved for this call");
    }
    if (!this.config.apiKey) {
      throw new Error("GoogleSttAdapter: GOOGLE_STT_API_KEY is not set");
    }
    const languageCode = this.config.languageCode ?? "uz-UZ";
    const buf = await readFile(req.audioUrl);
    const body = {
      config: {
        languageCode,
        enableAutomaticPunctuation: true,
        ...(this.config.alternativeLanguageCodes?.length
          ? { alternativeLanguageCodes: this.config.alternativeLanguageCodes }
          : {}),
      },
      audio: { content: buf.toString("base64") },
    };

    const res = await fetch(
      `https://speech.googleapis.com/v1/speech:recognize?key=${encodeURIComponent(this.config.apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Google STT HTTP ${res.status}: ${errText.slice(0, 200)}`);
    }
    const json = (await res.json()) as GoogleRecognizeResponse;
    const results = json.results ?? [];
    const text = results
      .map((r) => r.alternatives?.[0]?.transcript ?? "")
      .filter(Boolean)
      .join(" ")
      .trim();
    const confs = results
      .map((r) => r.alternatives?.[0]?.confidence ?? 0)
      .filter((c) => c > 0);
    const confidence = confs.length ? confs.reduce((a, b) => a + b, 0) / confs.length : 0.9;
    const segments: TranscriptSegment[] = text
      ? [{ speaker: "unknown", start: 0, end: 0, text }]
      : [];

    return { text, segments, language: toLang(languageCode), confidence };
  }
}
