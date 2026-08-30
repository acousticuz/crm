import { startAgiServer } from "./agi/agi-server";
import { CallHandler } from "./agi/call-handler";
import { StreamingSttService } from "./stt/streaming-stt.service";
import { GoogleTtsService } from "./tts/google-tts.service";
import { ElevenLabsTtsService } from "./tts/elevenlabs-tts.service";
import { AzureTtsService } from "./tts/azure-tts.service";
import type { TtsService } from "./tts/tts-service";
import { ClaudeAgentService } from "./ai/claude-agent.service";
import { CrmBridge } from "./crm/crm-bridge.service";
import { TelegramNotifier } from "./telegram/notifier.service";

function envBool(key: string, fallback: boolean): boolean {
  const raw = process.env[key];
  if (raw === undefined) return fallback;
  return raw === "1" || raw.toLowerCase() === "true";
}

function envNumber(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function parseWebhookSecrets(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    // fall through
  }
  return {};
}

function parseBranchChats(raw: string | undefined): Record<string, number> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, number>;
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    // fall through
  }
  return {};
}

async function main(): Promise<void> {
  const tenantId = process.env.VOICE_AI_TENANT_ID;
  if (!tenantId) {
    console.error(
      "voice-ai-worker: VOICE_AI_TENANT_ID is required (the CRM tenant calls are attributed to)",
    );
    process.exit(1);
  }

  const backendBaseUrl = process.env.BACKEND_URL ?? "http://localhost:3005";
  const sharedSecret = process.env.TELEPHONY_WORKER_SECRET ?? "";

  const stt = new StreamingSttService({
    keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    model: process.env.VOICE_AI_STT_MODEL ?? "phone_call",
  });
  const ttsProvider = (process.env.VOICE_AI_TTS_PROVIDER ?? "google").toLowerCase();
  const ttsCacheDir = process.env.TTS_CACHE_DIR ?? "/tmp/voice-ai-tts-cache";
  let tts: TtsService;
  if (ttsProvider === "azure") {
    tts = new AzureTtsService({
      apiKey: process.env.AZURE_SPEECH_KEY ?? "",
      region: process.env.AZURE_SPEECH_REGION ?? "",
      cacheDir: ttsCacheDir,
      voiceUz: process.env.AZURE_SPEECH_VOICE_UZ,
      voiceRu: process.env.AZURE_SPEECH_VOICE_RU,
      speakingRate: process.env.AZURE_SPEECH_RATE
        ? Number(process.env.AZURE_SPEECH_RATE)
        : undefined,
    });
    console.log(
      `[voice-ai] TTS: Azure (voice=${process.env.AZURE_SPEECH_VOICE_UZ ?? "uz-UZ-MadinaNeural"})`,
    );
  } else if (ttsProvider === "elevenlabs") {
    tts = new ElevenLabsTtsService({
      apiKey: process.env.ELEVENLABS_API_KEY ?? "",
      cacheDir: ttsCacheDir,
      voiceId: process.env.ELEVENLABS_VOICE_ID,
      modelId: process.env.ELEVENLABS_MODEL_ID,
    });
    console.log(`[voice-ai] TTS: ElevenLabs (voice=${process.env.ELEVENLABS_VOICE_ID ?? "Rachel"})`);
  } else {
    tts = new GoogleTtsService({
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
      cacheDir: ttsCacheDir,
    });
    console.log("[voice-ai] TTS: Google");
  }
  const ai = new ClaudeAgentService({
    apiKey: process.env.ANTHROPIC_API_KEY ?? "",
    model: process.env.VOICE_AI_CLAUDE_MODEL ?? "claude-opus-4-7",
    historyTurns: envNumber("VOICE_AI_HISTORY_TURNS", 12),
  });
  const crm = new CrmBridge({
    backendBaseUrl,
    sharedSecret,
    webhookSecrets: parseWebhookSecrets(process.env.VOICE_AI_WEBHOOK_SECRETS),
  });
  const notifier = new TelegramNotifier({
    botToken: process.env.VOICE_AI_TELEGRAM_BOT_TOKEN,
    branchChats: parseBranchChats(process.env.VOICE_AI_TELEGRAM_BRANCH_CHATS),
    masterChatId: process.env.VOICE_AI_TELEGRAM_MASTER_CHAT_ID
      ? Number(process.env.VOICE_AI_TELEGRAM_MASTER_CHAT_ID)
      : undefined,
  });

  const port = envNumber("VOICE_AI_AGI_PORT", 4573);
  const host = process.env.VOICE_AI_AGI_HOST ?? "0.0.0.0";
  const recordingsDir = process.env.VOICE_AI_RECORDINGS_DIR ?? "/var/spool/asterisk/voice-ai";
  const greetingSound = process.env.VOICE_AI_GREETING_SOUND ?? "acoustic/greeting-uz";
  const transferContext = process.env.VOICE_AI_TRANSFER_CONTEXT ?? undefined;

  startAgiServer({
    port,
    host,
    createHandler: (channel) =>
      new CallHandler(channel, {
        tenantId,
        recordingsDir,
        ttsCacheDir: process.env.TTS_CACHE_DIR ?? "/tmp/voice-ai-tts-cache",
        stt,
        tts,
        ai,
        crm,
        notifier,
        greetingSound,
        transferContext,
        maxTurns: envNumber("VOICE_AI_MAX_TURNS", 18),
        maxSilenceMs: envNumber("VOICE_AI_MAX_SILENCE_MS", 3_000),
        maxTurnDurationMs: envNumber("VOICE_AI_MAX_TURN_MS", 30_000),
      }),
  });

  const useEnhancedSummary = envBool("VOICE_AI_VERBOSE_BOOT", false);
  if (useEnhancedSummary) {
    console.log(
      `voice-ai-worker booted: tenant=${tenantId} agi=${host}:${port} backend=${backendBaseUrl}`,
    );
  }
}

main().catch((err: Error) => {
  console.error(`voice-ai-worker failed to start: ${err.message}`);
  process.exit(1);
});
