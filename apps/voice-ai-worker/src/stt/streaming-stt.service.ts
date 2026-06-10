import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Transform } from "node:stream";
import { v1p1beta1 as speech, protos } from "@google-cloud/speech";

export interface StreamingSttRequest {
  primaryLanguage: "uz-UZ" | "ru-RU" | "en-US";
  alternativeLanguages?: string[];
  /** Recording sample rate. RECORD FILE … sln16 produces 16000 Hz mono LINEAR16. */
  sampleRateHertz: 8000 | 16000;
}

export interface StreamingSttResult {
  text: string;
  language: "uz" | "ru" | "en";
  confidence: number;
}

/**
 * Streaming Speech-to-Text built on Google Cloud's StreamingRecognize gRPC
 * endpoint. We push audio chunks as they arrive (from a local .sln16 file
 * RECORD FILE wrote, or any other LINEAR16 source) and collect the final
 * transcript when the stream closes.
 *
 * Why streaming instead of the batch `recognize` call used by ai-worker? On a
 * live conversation we need each turn back in ~500ms after the customer stops
 * talking — streaming gives interim results and a final transcript without
 * the 1-3s round-trip a synchronous request adds.
 */
export class StreamingSttService {
  private client: speech.SpeechClient;
  private readonly model: string;

  constructor(opts: {
    /** Path to Google Cloud service-account JSON. Falls back to GOOGLE_APPLICATION_CREDENTIALS. */
    keyFilename?: string;
    /** Defaults to `phone_call` — the telephony-optimized acoustic model. */
    model?: string;
  } = {}) {
    this.client = new speech.SpeechClient(
      opts.keyFilename ? { keyFilename: opts.keyFilename } : undefined,
    );
    this.model = opts.model ?? "phone_call";
  }

  /**
   * Transcribe a finished recording by streaming it as if it arrived live.
   * Used by the call handler — each turn is one RECORD FILE → one stream.
   */
  async transcribeFile(audioPath: string, req: StreamingSttRequest): Promise<StreamingSttResult> {
    const info = await stat(audioPath);
    if (info.size === 0) return { text: "", language: this.toLang(req.primaryLanguage), confidence: 0 };

    const recognitionConfig: protos.google.cloud.speech.v1p1beta1.IRecognitionConfig = {
      encoding: "LINEAR16",
      sampleRateHertz: req.sampleRateHertz,
      languageCode: req.primaryLanguage,
      alternativeLanguageCodes: req.alternativeLanguages ?? [],
      enableAutomaticPunctuation: true,
      model: this.model,
      useEnhanced: true,
      audioChannelCount: 1,
    };

    return new Promise<StreamingSttResult>((resolve, reject) => {
      const finalResults: Array<{ text: string; confidence: number; lang: string }> = [];

      const recognizeStream = this.client
        .streamingRecognize({
          config: recognitionConfig,
          interimResults: false,
          singleUtterance: false,
        })
        .on("error", reject)
        .on(
          "data",
          (chunk: protos.google.cloud.speech.v1p1beta1.IStreamingRecognizeResponse) => {
            for (const r of chunk.results ?? []) {
              const alt = r.alternatives?.[0];
              if (r.isFinal && alt?.transcript) {
                finalResults.push({
                  text: alt.transcript.trim(),
                  confidence: alt.confidence ?? 0,
                  lang: r.languageCode ?? req.primaryLanguage,
                });
              }
            }
          },
        )
        .on("end", () => {
          if (finalResults.length === 0) {
            resolve({ text: "", language: this.toLang(req.primaryLanguage), confidence: 0 });
            return;
          }
          const text = finalResults.map((r) => r.text).join(" ").trim();
          const confs = finalResults.map((r) => r.confidence).filter((c) => c > 0);
          const confidence = confs.length ? confs.reduce((a, b) => a + b, 0) / confs.length : 0.85;
          resolve({
            text,
            language: this.toLang(finalResults[0]?.lang ?? req.primaryLanguage),
            confidence,
          });
        });

      // Push audio chunks. wrap with Transform so we send streaming-recognize
      // request frames rather than raw bytes (the gRPC client expects
      // {audioContent: Buffer}).
      const wrapper = new Transform({
        objectMode: true,
        transform(chunk: Buffer, _enc, cb) {
          cb(null, { audioContent: chunk });
        },
      });
      createReadStream(audioPath, { highWaterMark: 4096 })
        .on("error", reject)
        .pipe(wrapper)
        .pipe(recognizeStream);
    });
  }

  private toLang(code: string): "uz" | "ru" | "en" {
    const lower = code.toLowerCase();
    if (lower.startsWith("ru")) return "ru";
    if (lower.startsWith("en")) return "en";
    return "uz";
  }
}
