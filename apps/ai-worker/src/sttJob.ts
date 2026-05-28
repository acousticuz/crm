import { execFileSync } from "node:child_process";
import type { SttAdapter } from "./stt/stt-adapter";
import type { BackendClient } from "./backend.client";

export interface SttJobData {
  callId: string;
  tenantId: string;
  recordingUrl?: string;
  // Asterisk uniqueid — recording filenames end with `-{cdrUniqueId}.wav`, so
  // we can resolve the file from the NFS-mounted recordings dir.
  cdrUniqueId?: string;
  language?: "uz" | "ru" | "en";
}

/**
 * Resolve the local recording file for a call. Prefers an explicit
 * recordingUrl; otherwise searches RECORDINGS_DIR for a non-empty file whose
 * name ends with the call's uniqueid. Returns "" when none is found (the mock
 * adapter ignores it; Whisper needs a real file).
 */
function resolveRecording(data: SttJobData): string {
  if (data.recordingUrl) return data.recordingUrl;
  const dir = process.env.RECORDINGS_DIR;
  if (!dir || !data.cdrUniqueId || !/^[\d.]+$/.test(data.cdrUniqueId)) return "";
  try {
    const out = execFileSync(
      "find",
      [dir, "-name", `*${data.cdrUniqueId}.wav`, "-type", "f", "-size", "+1k"],
      { encoding: "utf8", timeout: 10_000 },
    ).trim();
    return out.split("\n").filter(Boolean)[0] ?? "";
  } catch {
    return "";
  }
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
  const audioUrl = resolveRecording(data);
  console.log(
    `STT[${deps.adapter.name}] call=${data.callId} cdr=${data.cdrUniqueId ?? "-"} audio=${audioUrl || "NONE"}`,
  );
  const result = await deps.adapter.transcribe({
    audioUrl,
    language: data.language,
    callId: data.callId,
  });
  console.log(`STT[${deps.adapter.name}] result(${result.text.length}): ${result.text.slice(0, 60)}`);
  await deps.backend.writeTranscript({
    tenantId: data.tenantId,
    callId: data.callId,
    text: result.text,
    segments: result.segments,
    language: result.language,
    confidence: result.confidence,
  });
}
