import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ClaudeAgentService, AiTurn, CollectedData } from "../ai/claude-agent.service";
import type { CrmBridge } from "../crm/crm-bridge.service";
import type { TelegramNotifier } from "../telegram/notifier.service";
import type { StreamingSttService } from "../stt/streaming-stt.service";
import type { TtsService } from "../tts/tts-service";
import type { AgiChannel } from "./agi-protocol";

export interface CallHandlerDeps {
  tenantId: string;
  recordingsDir: string;
  ttsCacheDir: string;
  stt: StreamingSttService;
  tts: TtsService;
  ai: ClaudeAgentService;
  crm: CrmBridge;
  notifier: TelegramNotifier;
  /**
   * Greeting WAV file Asterisk can play before we hand over to LLM/TTS — keeps
   * the first second of the call latency-free. Path is relative to Asterisk's
   * sounds dir (no extension).
   */
  greetingSound: string;
  /** Sound to play when transferring to the operator queue. Optional. */
  transferContext?: string;
  maxTurns: number;
  maxSilenceMs: number;
  maxTurnDurationMs: number;
}

/**
 * Drives a single inbound call: greet → listen → Claude → speak → loop until
 * Claude returns action=end / save_to_crm / transfer, or until safety limits
 * trip (max turns, hangup, etc.). Every collected datum and the full transcript
 * are POSTed to the CRM at the end so a human can follow up.
 */
export class CallHandler {
  private turns = 0;
  private callStartedAt = Date.now();
  private callerPhone = "";
  private conversation: AiTurn[] = [];
  private collected: CollectedData = {};
  private lastAiNotes = "";
  private finalReason: "end" | "transfer" | "max_turns" | "hangup" | "error" = "end";

  constructor(
    private readonly ch: AgiChannel,
    private readonly deps: CallHandlerDeps,
  ) {}

  async handle(): Promise<void> {
    this.callerPhone = normalizePhone(this.ch.env.callerIdNum);
    console.log(
      `[voice-ai] call started: tenant=${this.deps.tenantId} channel=${this.ch.env.channel} caller=${this.callerPhone}`,
    );

    try {
      await this.ch.answer();
      await this.playGreeting();

      while (this.turns < this.deps.maxTurns && !this.ch.isClosed()) {
        this.turns += 1;
        const heard = await this.listen();
        if (!heard) {
          // Silence — re-prompt once, then bail.
          if (this.turns === 1) {
            await this.speak("Eshityapman, sizni tinglayman. Iltimos, gapiring.");
            continue;
          }
          this.finalReason = "hangup";
          break;
        }

        const turn = await this.deps.ai.respond({
          conversation: this.conversation,
          userSpeech: heard.text,
          callerPhone: this.callerPhone,
          collectedSoFar: this.collected,
          language: heard.language,
        });

        // Track everything Claude pulled out, even if action=continue.
        this.collected = { ...this.collected, ...turn.collected };
        if (turn.notes) this.lastAiNotes = turn.notes;
        this.conversation.push(
          { role: "user", content: heard.text },
          { role: "assistant", content: JSON.stringify(turn) },
        );

        await this.speak(turn.speak);

        if (turn.action === "save_to_crm") {
          await this.persistCrm();
          this.finalReason = "end";
          break;
        }
        if (turn.action === "transfer") {
          // Best-effort: jump the channel into the operator queue. If no
          // transfer context is configured we save what we have and hang up.
          await this.transferToOperator();
          this.finalReason = "transfer";
          break;
        }
        if (turn.action === "end") {
          this.finalReason = "end";
          break;
        }
      }

      if (this.turns >= this.deps.maxTurns && this.finalReason === "end") {
        this.finalReason = "max_turns";
      }
    } catch (err) {
      this.finalReason = "error";
      console.error(`[voice-ai] handler exception: ${(err as Error).message}`);
    } finally {
      // Always notify staff so a half-finished call still surfaces in Telegram
      // and we never silently drop a real lead.
      const durationSeconds = Math.max(1, Math.round((Date.now() - this.callStartedAt) / 1000));
      try {
        await this.deps.notifier.sendCallSummary({
          tenantId: this.deps.tenantId,
          phone: this.callerPhone,
          durationSeconds,
          collected: this.collected,
          notes: this.lastAiNotes,
          endReason: this.finalReason,
          transcript: this.conversation,
          uniqueId: this.ch.env.uniqueId,
        });
      } catch (err) {
        console.error(`[voice-ai] notifier failed: ${(err as Error).message}`);
      }

      // If we saved to CRM above, do not duplicate; otherwise post whatever we
      // gathered as a "needs follow-up" Lead so it never gets lost.
      if (this.finalReason !== "end" && this.finalReason !== "transfer") {
        try {
          await this.persistCrm();
        } catch (err) {
          console.error(`[voice-ai] CRM follow-up post failed: ${(err as Error).message}`);
        }
      }

      if (!this.ch.isClosed()) {
        try {
          await this.ch.hangup();
        } catch {
          // Channel already gone — nothing to clean up.
        }
      }
    }
  }

  private async playGreeting(): Promise<void> {
    // Try the pre-recorded greeting first (zero TTS latency); fall back to a
    // synthesized one if the file is missing.
    const stock = this.deps.greetingSound;
    if (stock) {
      const res = await this.ch.streamFile(stock);
      if (res.code === 200) return;
    }
    await this.speak(
      "Assalomu alaykum! Acoustic eshitish markaziga qo'ng'iroq qilganingiz uchun rahmat. " +
        "Men sizga yordam berishim mumkin. Qanday savol bilan murojaat qilyapsiz?",
    );
  }

  private async ensureRecordingsDir(): Promise<void> {
    if (existsSync(this.deps.recordingsDir)) return;
    await mkdir(this.deps.recordingsDir, { recursive: true });
  }

  /**
   * Capture one customer utterance. We record to a shared dir Asterisk and the
   * worker both see (NFS or local-on-PBX). The file is then streamed to Google
   * Cloud STT.
   */
  private async listen(): Promise<{ text: string; language: "uz" | "ru" | "en" } | null> {
    await this.ensureRecordingsDir();
    const turnId = `${this.ch.env.uniqueId}-${this.turns}`;
    const filePath = join(this.deps.recordingsDir, `turn-${turnId}`);
    const res = await this.ch.recordFile({
      path: filePath,
      format: "sln16",
      maxDurationMs: this.deps.maxTurnDurationMs,
      silenceSeconds: Math.max(1, Math.round(this.deps.maxSilenceMs / 1000)),
      escapeDigits: "#",
      beep: false,
    });
    // result=-1 means hangup before recording started.
    if (res.code !== 200 || res.result === "-1") {
      this.finalReason = "hangup";
      return null;
    }
    const audioPath = `${filePath}.sln16`;
    if (!existsSync(audioPath)) {
      console.warn(`[voice-ai] expected ${audioPath} after RECORD FILE`);
      return null;
    }
    try {
      const transcript = await this.deps.stt.transcribeFile(audioPath, {
        primaryLanguage: "uz-UZ",
        alternativeLanguages: ["ru-RU"],
        sampleRateHertz: 16000,
      });
      if (!transcript.text.trim() || transcript.confidence < 0.4) {
        console.log(
          `[voice-ai] low-confidence STT (${transcript.confidence}) — turn=${this.turns}`,
        );
        return null;
      }
      console.log(
        `[voice-ai] turn=${this.turns} caller=${this.callerPhone} stt(${transcript.language}, conf=${transcript.confidence.toFixed(2)}): ${transcript.text}`,
      );
      return { text: transcript.text, language: transcript.language };
    } catch (err) {
      console.error(`[voice-ai] STT failed turn=${this.turns}: ${(err as Error).message}`);
      return null;
    }
  }

  private async speak(text: string): Promise<void> {
    if (!text.trim()) return;
    try {
      // The TTS service returns a path to a 16kHz LINEAR16 .sln16 file that
      // STREAM FILE can play directly. We pass the path WITHOUT the extension
      // — that's how Asterisk's audio file lookup works.
      const synthPath = await this.deps.tts.synthesize(text, {
        language: this.preferredTtsLanguage(),
      });
      const noExt = synthPath.replace(/\.(sln16|wav|gsm)$/i, "");
      await this.ch.streamFile(noExt);
    } catch (err) {
      // If TTS dies, fall back to PLAYBACK of a stock "please hold" so the
      // caller at least hears something rather than silence.
      console.error(`[voice-ai] TTS failed: ${(err as Error).message}`);
      await this.ch.noop(`TTS-FAIL: ${text.slice(0, 60)}`);
    }
  }

  private preferredTtsLanguage(): "uz" | "ru" {
    return this.collected.language === "ru" ? "ru" : "uz";
  }

  private async persistCrm(): Promise<void> {
    if (!this.callerPhone) return;
    await this.deps.crm.captureAiCall({
      tenantId: this.deps.tenantId,
      callerPhone: this.callerPhone,
      cdrUniqueId: this.ch.env.uniqueId,
      dnid: this.ch.env.dnid ?? "",
      startedAt: new Date(this.callStartedAt).toISOString(),
      durationSeconds: Math.max(1, Math.round((Date.now() - this.callStartedAt) / 1000)),
      collected: this.collected,
      notes: this.lastAiNotes,
      transcript: this.conversation,
    });
  }

  private async transferToOperator(): Promise<void> {
    const ctx = this.deps.transferContext;
    if (!ctx) {
      await this.speak(
        "Sizni xodimimizga ulayman. Iltimos, kuting.",
      );
      return;
    }
    // Asterisk: jump back into the queue context. The dialplan owns the queue
    // routing — we just hand control back, no answer is needed.
    await this.ch.exec("Goto", `${ctx},s,1`);
  }
}

function normalizePhone(input: string): string {
  const digits = (input ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("998")) return `+${digits}`;
  if (digits.length === 9) return `+998${digits}`;
  return `+${digits}`;
}
