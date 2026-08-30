/**
 * TTS provider contract. Both Google and ElevenLabs implementations satisfy
 * this so the CallHandler doesn't care which engine is wired up.
 *
 * The returned path is a 16kHz LINEAR16 .sln16 file on disk that Asterisk can
 * STREAM FILE directly (or, with the sshfs mount, on the FreePBX side too).
 */
export interface TtsService {
  synthesize(text: string, opts: { language: "uz" | "ru" }): Promise<string>;
}
