import type { TranscriptSegment } from "@acoustic-crm/shared";

export interface SttTranscript {
  text: string;
  segments: TranscriptSegment[];
  language: "uz" | "ru" | "en";
  confidence: number;
}

export interface SttRequest {
  audioUrl: string;
  // Hint to the adapter — actual language is auto-detected.
  language?: "uz" | "ru" | "en";
  callId: string;
}

/**
 * Adapter every STT implementation satisfies. Implementations are
 * responsible for downloading audio when needed; they may rely on the audio
 * being a public URL, a signed MinIO URL, or a local file path depending on
 * the deployment.
 */
export interface SttAdapter {
  readonly name: string;
  transcribe(request: SttRequest): Promise<SttTranscript>;
}
