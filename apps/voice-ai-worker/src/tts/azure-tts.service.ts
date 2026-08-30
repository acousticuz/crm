import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { TtsService } from "./tts-service";

/**
 * Microsoft Azure Cognitive Services Speech TTS adapter.
 *
 * Why Azure? Because Microsoft ships **native Uzbek neural voices** that
 * Google does not have:
 *   - uz-UZ-MadinaNeural (female, warm)
 *   - uz-UZ-SardorNeural (male)
 *
 * Free tier covers 500K characters/month — comfortably enough for production
 * call volume on a single tenant.
 *
 * Output format is `raw-16khz-16bit-mono-pcm` — exactly the .sln16 layout
 * Asterisk's STREAM FILE expects, no WAV header, no conversion.
 */
export class AzureTtsService implements TtsService {
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly cacheDir: string;
  private readonly voices: Record<"uz" | "ru", string>;
  private readonly speakingRate: number;

  constructor(opts: {
    apiKey: string;
    region: string;
    cacheDir: string;
    voiceUz?: string;
    voiceRu?: string;
    speakingRate?: number;
  }) {
    if (!opts.apiKey) throw new Error("AzureTtsService: AZURE_SPEECH_KEY is required");
    if (!opts.region) throw new Error("AzureTtsService: AZURE_SPEECH_REGION is required");
    this.apiKey = opts.apiKey;
    this.endpoint = `https://${opts.region}.tts.speech.microsoft.com/cognitiveservices/v1`;
    this.cacheDir = opts.cacheDir;
    this.voices = {
      uz: opts.voiceUz ?? "uz-UZ-MadinaNeural",
      ru: opts.voiceRu ?? "ru-RU-SvetlanaNeural",
    };
    // Negative numbers slow down, positive numbers speed up. -8% reads
    // naturally on telephony lines without sounding sluggish.
    this.speakingRate = opts.speakingRate ?? 0;
  }

  async synthesize(text: string, opts: { language: "uz" | "ru" }): Promise<string> {
    if (!existsSync(this.cacheDir)) {
      await mkdir(this.cacheDir, { recursive: true });
    }
    const voice = this.voices[opts.language] ?? this.voices.uz;
    const langCode = voice.split("-").slice(0, 2).join("-");
    const cacheKey = createHash("md5")
      .update(`azure|${voice}|${this.speakingRate}|${text}`)
      .digest("hex");
    const cachePath = join(this.cacheDir, `${cacheKey}.sln16`);
    if (existsSync(cachePath)) return cachePath;

    const ssml = this.buildSsml(text, voice, langCode);
    const res = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": this.apiKey,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "raw-16khz-16bit-mono-pcm",
        "User-Agent": "acoustic-voice-ai",
      },
      body: ssml,
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Azure TTS HTTP ${res.status}: ${errText.slice(0, 200)}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    await writeFile(cachePath, buf);
    return cachePath;
  }

  /**
   * Build SSML envelope. The prosody rate gives us per-utterance speed
   * control; embedded XML-escaping prevents user input (LLM output) from
   * breaking the request.
   */
  private buildSsml(text: string, voice: string, langCode: string): string {
    const sign = this.speakingRate >= 0 ? "+" : "";
    return (
      `<speak version="1.0" xml:lang="${langCode}">` +
      `<voice name="${voice}">` +
      `<prosody rate="${sign}${this.speakingRate}%">${escapeXml(text)}</prosody>` +
      `</voice></speak>`
    );
  }
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
