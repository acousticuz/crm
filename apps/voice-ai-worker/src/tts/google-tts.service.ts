import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { TextToSpeechClient } from "@google-cloud/text-to-speech";
import type { TtsService } from "./tts-service";

export interface SynthesizeOptions {
  language: "uz" | "ru";
  /** Female voices by default — see the Voice rules in the system prompt. */
  voice?: string;
  /** 0.95 = slightly slower than natural, reads warmer on the phone. */
  speakingRate?: number;
}

/**
 * Google Cloud Text-to-Speech wrapper tuned for Asterisk playback. The output
 * file is 16kHz LINEAR16 mono (.sln16 extension), which STREAM FILE plays
 * natively without resampling.
 *
 * Repeated lines (greetings, hold messages, "kuting") hit a md5-keyed disk
 * cache — TTS is the most expensive piece of the pipeline on a per-call basis.
 */
export class GoogleTtsService implements TtsService {
  private readonly client: TextToSpeechClient;
  private readonly cacheDir: string;
  // Google has NO native Uzbek TTS voice as of 2026-06. For Uzbek text we use
  // the Russian female Wavenet voice — phonetically close enough on telephony
  // audio (caller barely notices the accent) and the only realistic option
  // without bringing in a separate provider. When Google ships an uz-UZ voice
  // we'll flip this back. Override via env (VOICE_AI_TTS_VOICE_UZ / _RU).
  private readonly defaultVoices: Record<"uz" | "ru", string> = {
    uz: process.env.VOICE_AI_TTS_VOICE_UZ ?? "ru-RU-Wavenet-C",
    ru: process.env.VOICE_AI_TTS_VOICE_RU ?? "ru-RU-Wavenet-C",
  };

  constructor(opts: { keyFilename?: string; cacheDir: string }) {
    this.client = new TextToSpeechClient(
      opts.keyFilename ? { keyFilename: opts.keyFilename } : undefined,
    );
    this.cacheDir = opts.cacheDir;
  }

  async synthesize(text: string, opts: SynthesizeOptions): Promise<string> {
    if (!existsSync(this.cacheDir)) {
      await mkdir(this.cacheDir, { recursive: true });
    }
    const voice = opts.voice ?? this.defaultVoices[opts.language] ?? this.defaultVoices.uz;
    const rate = opts.speakingRate ?? 0.95;
    const key = createHash("md5")
      .update(`${voice}|${rate}|${text}`)
      .digest("hex");
    const cachePath = join(this.cacheDir, `${key}.sln16`);
    if (existsSync(cachePath)) return cachePath;

    // We always send `ru-RU` as the languageCode — both the Russian voice for
    // Russian text and the Russian voice we use to read Uzbek text (no uz-UZ
    // voice exists). Sending `uz-UZ` with a Russian voice fails with
    // INVALID_ARGUMENT, so this normalization is required.
    const languageCode = voice.split("-").slice(0, 2).join("-") || "ru-RU";
    const [response] = await this.client.synthesizeSpeech({
      input: { text },
      voice: {
        languageCode,
        name: voice,
        ssmlGender: "FEMALE",
      },
      audioConfig: {
        audioEncoding: "LINEAR16",
        sampleRateHertz: 16000,
        speakingRate: rate,
        pitch: 0,
        effectsProfileId: ["telephony-class-application"],
      },
    });
    const buf = response.audioContent as Buffer | Uint8Array | string;
    if (!buf) {
      throw new Error("GoogleTtsService: empty audioContent");
    }
    // Google returns LINEAR16 WITH a WAV header. STREAM FILE needs raw .sln16
    // (no header), so strip the WAV header if present.
    const raw = stripWavHeader(buf);
    await writeFile(cachePath, raw);
    return cachePath;
  }
}

function stripWavHeader(buf: Buffer | Uint8Array | string): Buffer {
  const b = typeof buf === "string" ? Buffer.from(buf, "binary") : Buffer.from(buf);
  if (b.length < 44) return b;
  // RIFF/WAVE container?  Find the "data" chunk and return everything after.
  if (b.toString("ascii", 0, 4) !== "RIFF") return b;
  let off = 12;
  while (off + 8 <= b.length) {
    const id = b.toString("ascii", off, off + 4);
    const size = b.readUInt32LE(off + 4);
    if (id === "data") return b.subarray(off + 8, off + 8 + size);
    off += 8 + size + (size % 2);
  }
  return b;
}
