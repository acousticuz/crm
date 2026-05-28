import type { SttAdapter, SttRequest, SttTranscript } from "./stt-adapter";

/**
 * OpenAI Whisper (or whisper-compatible) STT adapter skeleton. Real impl
 * (M11) would download the recording from `req.audioUrl` (typically a
 * signed MinIO URL), upload to /v1/audio/transcriptions with
 * `response_format=verbose_json` to get word-level timestamps, and run a
 * diarization pass (e.g., pyannote service) to split operator vs customer.
 *
 * For M7 we throw if invoked — tests use MockSttAdapter. We ship the class
 * so production provisioning is a config flip rather than a code change.
 */
export class WhisperSttAdapter implements SttAdapter {
  readonly name = "whisper";

  constructor(
    private readonly config: { apiKey: string; baseUrl?: string },
  ) {
    void this.config;
  }

  async transcribe(_req: SttRequest): Promise<SttTranscript> {
    throw new Error(
      "WhisperSttAdapter is a skeleton — wire OpenAI/whisper-compatible STT + diarization in M11 deploy-hardening.",
    );
  }
}
