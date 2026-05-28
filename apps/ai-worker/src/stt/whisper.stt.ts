import { readFile } from "node:fs/promises";
import type { TranscriptSegment } from "@acoustic-crm/shared";
import type { SttAdapter, SttRequest, SttTranscript } from "./stt-adapter";

interface WhisperVerboseResponse {
  text?: string;
  language?: string;
  segments?: Array<{ start?: number; end?: number; text?: string; no_speech_prob?: number }>;
}

function mapLanguage(lang?: string): "uz" | "ru" | "en" {
  const l = (lang ?? "").toLowerCase();
  if (l.startsWith("uz") || l === "uzbek") return "uz";
  if (l.startsWith("ru") || l === "russian") return "ru";
  if (l.startsWith("en") || l === "english") return "en";
  return "uz";
}

/**
 * Strip transcription "looping" hallucinations — on quiet/noisy audio the model
 * sometimes emits the same chunk dozens of times. Collapse any 1–40 char unit
 * repeated 4+ times in a row down to one occurrence. We never invent text; we
 * only remove the model's runaway repetition.
 */
function stripLoops(text: string): string {
  return text.replace(/(.{1,40}?)\1{3,}/g, "$1").trim();
}

/**
 * OpenAI Whisper STT adapter. Reads the (NFS-mounted) recording file and
 * uploads it to /v1/audio/transcriptions with verbose_json so we get
 * per-segment timestamps. FreePBX MixMonitor writes a single mixed mono file,
 * so we can't separate operator vs customer — segments are labelled "unknown".
 */
export class WhisperSttAdapter implements SttAdapter {
  readonly name = "whisper";

  constructor(
    private readonly config: { apiKey: string; baseUrl?: string; model?: string; language?: string },
  ) {}

  async transcribe(req: SttRequest): Promise<SttTranscript> {
    if (!req.audioUrl) {
      throw new Error("WhisperSttAdapter: no recording file resolved for this call");
    }
    if (!this.config.apiKey) {
      throw new Error("WhisperSttAdapter: OPENAI_API_KEY is not set");
    }
    const baseUrl = (this.config.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "");
    const model = this.config.model ?? "whisper-1";
    // gpt-4o-transcribe / gpt-4o-mini-transcribe only support response_format
    // "json"/"text" (no verbose_json, no segment timestamps). whisper-1 gives
    // verbose_json with segments.
    const isGpt4o = model.startsWith("gpt-4o");
    const buf = await readFile(req.audioUrl);

    const form = new FormData();
    form.append("file", new Blob([buf], { type: "audio/wav" }), "audio.wav");
    form.append("model", model);
    form.append("response_format", isGpt4o ? "json" : "verbose_json");
    // temperature=0 → deterministic, verbatim transcription with the least
    // hallucination (the model must not invent words on noisy/quiet audio).
    form.append("temperature", "0");
    // Force the language when configured (OPENAI_STT_LANGUAGE) so the model
    // doesn't mis-detect Uzbek as Kazakh/Azerbaijani. whisper-1 rejects "uz",
    // so only send for the gpt-4o transcription models.
    if (isGpt4o && this.config.language) {
      form.append("language", this.config.language);
    }

    const res = await fetch(`${baseUrl}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.config.apiKey}` },
      body: form,
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`OpenAI STT HTTP ${res.status}: ${errText.slice(0, 200)}`);
    }
    const json = (await res.json()) as WhisperVerboseResponse;
    const text = stripLoops((json.text ?? "").trim());

    if (isGpt4o) {
      // No timestamps/language from the gpt-4o transcription models — one
      // segment with the full text; language falls back to the call hint.
      return {
        text,
        segments: text ? [{ speaker: "unknown", start: 0, end: 0, text }] : [],
        language: mapLanguage(req.language),
        confidence: 0.9,
      };
    }

    const segments: TranscriptSegment[] = (json.segments ?? []).map((s) => ({
      speaker: "unknown",
      start: s.start ?? 0,
      end: s.end ?? 0,
      text: (s.text ?? "").trim(),
    }));
    const noSpeech = (json.segments ?? []).map((s) => s.no_speech_prob ?? 0);
    const confidence = noSpeech.length
      ? Math.max(0, Math.min(1, 1 - noSpeech.reduce((a, b) => a + b, 0) / noSpeech.length))
      : 0.9;

    return { text, segments, language: mapLanguage(json.language), confidence };
  }
}
