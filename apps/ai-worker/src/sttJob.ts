import type { SttAdapter } from "./stt/stt-adapter";
import type { BackendClient } from "./backend.client";

export interface SttJobData {
  callId: string;
  tenantId: string;
  recordingUrl: string;
  language?: "uz" | "ru" | "en";
}

/**
 * One STT job: run the adapter on the recording, then POST the result to
 * the backend. Pulled out of the BullMQ worker into a plain function so
 * tests can exercise the exact code path without spinning up Redis.
 */
export async function runSttJob(
  data: SttJobData,
  deps: { adapter: SttAdapter; backend: BackendClient },
): Promise<void> {
  const result = await deps.adapter.transcribe({
    audioUrl: data.recordingUrl,
    language: data.language,
    callId: data.callId,
  });
  await deps.backend.writeTranscript({
    tenantId: data.tenantId,
    callId: data.callId,
    text: result.text,
    segments: result.segments,
    language: result.language,
    confidence: result.confidence,
  });
}
