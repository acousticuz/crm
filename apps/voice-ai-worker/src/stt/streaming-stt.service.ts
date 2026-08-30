import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { SpeechClient, protos } from "@google-cloud/speech";

export interface StreamingSttRequest {
  primaryLanguage: "uz-UZ" | "ru-RU" | "en-US";
  /** Reserved for future use — `phone_call` model rejects this. We keep
   * primaryLanguage authoritative and ignore alternatives. */
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
 * endpoint. We use the v1 client (not v1p1beta1) and the `phone_call` model
 * tuned for 8/16 kHz telephony.
 *
 * Correct gRPC usage in @google-cloud/speech v6.x:
 *   const stream = client.streamingRecognize({ config, interimResults });
 *   fs.createReadStream(audioPath).pipe(stream);
 *
 * The library auto-wraps each raw byte chunk as `{audioContent: chunk}`; we
 * MUST NOT wrap ourselves (that breaks the message order and Google replies
 * with "Malordered Data Received").
 *
 * `phone_call` rejects `alternativeLanguageCodes` — if a tenant needs uz/ru
 * detection we would have to fall back to the `default` model. For now we
 * always run uz-UZ; the few Russian-speaking callers can be handled by a
 * separate route or a follow-up batch transcript.
 */
export class StreamingSttService {
  private client: SpeechClient;
  private readonly model: string;

  constructor(opts: {
    keyFilename?: string;
    model?: string;
  } = {}) {
    this.client = new SpeechClient(
      opts.keyFilename ? { keyFilename: opts.keyFilename } : undefined,
    );
    this.model = opts.model ?? "phone_call";
  }

  async transcribeFile(audioPath: string, req: StreamingSttRequest): Promise<StreamingSttResult> {
    const info = await stat(audioPath);
    if (info.size === 0) {
      return { text: "", language: this.toLang(req.primaryLanguage), confidence: 0 };
    }

    const config: protos.google.cloud.speech.v1.IRecognitionConfig = {
      encoding: "LINEAR16",
      sampleRateHertz: req.sampleRateHertz,
      languageCode: req.primaryLanguage,
      enableAutomaticPunctuation: true,
      model: this.model,
      useEnhanced: true,
      audioChannelCount: 1,
    };

    return new Promise<StreamingSttResult>((resolve, reject) => {
      const finalResults: Array<{ text: string; confidence: number; lang: string }> = [];

      const recognizeStream = this.client.streamingRecognize({
        config,
        interimResults: false,
        singleUtterance: false,
      });

      recognizeStream.on("error", reject);
      recognizeStream.on(
        "data",
        (chunk: protos.google.cloud.speech.v1.IStreamingRecognizeResponse) => {
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
      );
      recognizeStream.on("end", () => {
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

      // Pipe raw audio — the library wraps each chunk as audioContent for us.
      createReadStream(audioPath, { highWaterMark: 4096 })
        .on("error", reject)
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
