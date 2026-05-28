import { readFile } from "node:fs/promises";
import type { TranscriptSegment } from "@acoustic-crm/shared";
import type { SttAdapter, SttRequest, SttTranscript } from "./stt-adapter";

interface GoogleRecognizeResponse {
  error?: { message?: string };
  results?: Array<{
    alternatives?: Array<{ transcript?: string; confidence?: number }>;
  }>;
}

interface WavInfo {
  sampleRate: number;
  channels: number;
  bytesPerSample: number;
  dataStart: number;
  dataLen: number;
}

// Parse a PCM WAV header to find the audio format + raw PCM data range.
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
      const dataLen = Math.min(size || buf.length - dataStart, buf.length - dataStart);
      return { sampleRate, channels, bytesPerSample: bitsPerSample / 8, dataStart, dataLen };
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

function toLang(code?: string): "uz" | "ru" | "en" {
  const l = (code ?? "uz").slice(0, 2).toLowerCase();
  if (l === "ru") return "ru";
  if (l === "en") return "en";
  return "uz";
}

const CHUNK_SECONDS = 55; // stay under the 60s synchronous-recognize limit

/**
 * Google Cloud Speech-to-Text (v1) adapter. Uzbek ("uz-UZ") is officially
 * supported, which OpenAI's models transcribe poorly. Uses the synchronous
 * recognize endpoint with API-key auth. Audio longer than ~60s can't be sent
 * inline (and long-running needs a GCS uri), so we split the raw PCM into
 * <60s chunks and concatenate — works for any call length with just an API key.
 */
export class GoogleSttAdapter implements SttAdapter {
  readonly name = "google";

  constructor(
    private readonly config: { apiKey: string; languageCode?: string },
  ) {}

  private async recognizeChunk(pcm: Buffer, info: WavInfo): Promise<{ text: string; conf: number }> {
    const body = {
      config: {
        encoding: "LINEAR16",
        sampleRateHertz: info.sampleRate,
        audioChannelCount: info.channels,
        languageCode: this.config.languageCode ?? "uz-UZ",
        enableAutomaticPunctuation: true,
      },
      audio: { content: pcm.toString("base64") },
    };
    const res = await fetch(
      `https://speech.googleapis.com/v1/speech:recognize?key=${encodeURIComponent(this.config.apiKey)}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    );
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Google STT HTTP ${res.status}: ${errText.slice(0, 200)}`);
    }
    const json = (await res.json()) as GoogleRecognizeResponse;
    if (json.error) throw new Error(`Google STT: ${json.error.message}`);
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
    if (!req.audioUrl) {
      throw new Error("GoogleSttAdapter: no recording file resolved for this call");
    }
    if (!this.config.apiKey) {
      throw new Error("GoogleSttAdapter: GOOGLE_STT_API_KEY is not set");
    }
    const buf = await readFile(req.audioUrl);
    const info = parseWav(buf);
    const bytesPerSecond = info.sampleRate * info.channels * info.bytesPerSample || 16000;
    const chunkBytes = CHUNK_SECONDS * bytesPerSecond;
    const data = buf.subarray(info.dataStart, info.dataStart + info.dataLen);

    const texts: string[] = [];
    const confs: number[] = [];
    for (let off = 0; off < data.length; off += chunkBytes) {
      const { text, conf } = await this.recognizeChunk(data.subarray(off, off + chunkBytes), info);
      if (text) texts.push(text);
      if (conf > 0) confs.push(conf);
    }

    const text = texts.join(" ").trim();
    const confidence = confs.length ? confs.reduce((a, b) => a + b, 0) / confs.length : 0.9;
    const segments: TranscriptSegment[] = text
      ? [{ speaker: "unknown", start: 0, end: 0, text }]
      : [];
    return { text, segments, language: toLang(this.config.languageCode), confidence };
  }
}
