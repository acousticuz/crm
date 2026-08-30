import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { TtsService } from "./tts-service";

interface ElevenLabsVoiceSettings {
  stability: number;
  similarity_boost: number;
  style?: number;
  use_speaker_boost?: boolean;
}

/**
 * ElevenLabs TTS adapter — the only realistic option for natural Uzbek voice
 * output. Their `eleven_multilingual_v2` model handles 29+ languages including
 * Uzbek, with proper pronunciation and intonation (Google has no Uzbek voice;
 * Russian voices reading Uzbek text always sound robotic).
 *
 * We request `pcm_16000` output, which is raw 16-bit LINEAR16 at 16kHz mono —
 * exactly what Asterisk's STREAM FILE expects in a .sln16 file. No WAV header
 * to strip, just write the bytes to disk.
 */
export class ElevenLabsTtsService implements TtsService {
  private readonly cacheDir: string;
  private readonly apiKey: string;
  private readonly voiceId: string;
  private readonly modelId: string;
  private readonly voiceSettings: ElevenLabsVoiceSettings;

  constructor(opts: {
    apiKey: string;
    cacheDir: string;
    /**
     * ElevenLabs voice ID. Popular options:
     *   - Rachel (warm, female):    21m00Tcm4TlvDq8ikWAM
     *   - Bella (sweet, female):    EXAVITQu4vr4xnSDxMaL
     *   - Charlotte (mature, fem):  XB0fDUnXU5powFXDhCwa
     *   - Sarah (soft, female):     EXAVITQu4vr4xnSDxMaL
     * Defaults to Rachel.
     */
    voiceId?: string;
    /**
     * Defaults to multilingual v2 (29+ langs incl. Uzbek). Override to
     * `eleven_turbo_v2_5` for ~3× faster synthesis if you can accept slightly
     * lower quality.
     */
    modelId?: string;
    voiceSettings?: Partial<ElevenLabsVoiceSettings>;
  }) {
    if (!opts.apiKey) throw new Error("ElevenLabsTtsService: ELEVENLABS_API_KEY is required");
    this.apiKey = opts.apiKey;
    this.cacheDir = opts.cacheDir;
    this.voiceId = opts.voiceId ?? "21m00Tcm4TlvDq8ikWAM";
    this.modelId = opts.modelId ?? "eleven_multilingual_v2";
    this.voiceSettings = {
      stability: 0.5,
      similarity_boost: 0.75,
      style: 0.3,
      use_speaker_boost: true,
      ...opts.voiceSettings,
    };
  }

  async synthesize(text: string, _opts: { language: "uz" | "ru" }): Promise<string> {
    if (!existsSync(this.cacheDir)) {
      await mkdir(this.cacheDir, { recursive: true });
    }
    const cacheKey = createHash("md5")
      .update(`${this.voiceId}|${this.modelId}|${JSON.stringify(this.voiceSettings)}|${text}`)
      .digest("hex");
    const cachePath = join(this.cacheDir, `${cacheKey}.sln16`);
    if (existsSync(cachePath)) return cachePath;

    // pcm_16000 → raw 16-bit signed PCM at 16kHz mono = .sln16 format exactly.
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}?output_format=pcm_16000`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "xi-api-key": this.apiKey,
        "Content-Type": "application/json",
        Accept: "audio/pcm",
      },
      body: JSON.stringify({
        text,
        model_id: this.modelId,
        voice_settings: this.voiceSettings,
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`ElevenLabs HTTP ${res.status}: ${errText.slice(0, 200)}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    await writeFile(cachePath, buf);
    return cachePath;
  }
}
