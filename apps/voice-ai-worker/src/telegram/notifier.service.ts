import axios, { type AxiosInstance } from "axios";
import type { AiTurn, CollectedData } from "../ai/claude-agent.service";

export interface CallSummary {
  tenantId: string;
  uniqueId: string;
  phone: string;
  durationSeconds: number;
  collected: CollectedData;
  notes: string;
  endReason: "end" | "transfer" | "max_turns" | "hangup" | "error";
  transcript: AiTurn[];
}

/**
 * Telegram fan-out for AI-handled calls. Two destinations:
 *   - The branch-specific chat (if `branch` was identified and a chat map is
 *     configured in env), so the right team gets the lead.
 *   - The call-center master group, so supervisors see every AI call.
 *
 * Bot token is read from env (VOICE_AI_TELEGRAM_BOT_TOKEN). Per-branch chats
 * are configured as JSON in VOICE_AI_TELEGRAM_BRANCH_CHATS, e.g.
 *   {"Sebzor":-100123,"Yunusobod":-100456}
 */
export class TelegramNotifier {
  private readonly http: AxiosInstance | null;
  private readonly branchChats: Record<string, number>;
  private readonly masterChatId?: number;

  constructor(opts: {
    botToken?: string;
    branchChats?: Record<string, number>;
    masterChatId?: number;
  }) {
    if (opts.botToken) {
      this.http = axios.create({
        baseURL: `https://api.telegram.org/bot${opts.botToken}`,
        timeout: 5000,
      });
    } else {
      this.http = null;
    }
    this.branchChats = opts.branchChats ?? {};
    this.masterChatId = opts.masterChatId;
  }

  async sendCallSummary(summary: CallSummary): Promise<void> {
    if (!this.http) return; // no bot token — nothing to do
    const text = renderSummary(summary);
    const targets = new Set<number>();
    if (this.masterChatId) targets.add(this.masterChatId);
    const branch = summary.collected.branch;
    if (branch && this.branchChats[branch]) {
      targets.add(this.branchChats[branch]);
    }
    for (const chatId of targets) {
      try {
        await this.http.post("/sendMessage", {
          chat_id: chatId,
          text,
          parse_mode: "Markdown",
          disable_web_page_preview: true,
        });
      } catch (err) {
        console.error(
          `[voice-ai] Telegram sendMessage to ${chatId} failed: ${(err as Error).message}`,
        );
      }
    }
  }
}

function renderSummary(s: CallSummary): string {
  const c = s.collected;
  const conv = s.transcript
    .filter((t) => t.role !== "assistant" || /[a-zа-яёўғқҳ]/i.test(t.content) === false)
    .slice(-12)
    .map((t) => (t.role === "user" ? `👤 ${t.content}` : `🤖 ${shortAssistant(t.content)}`))
    .join("\n");

  const lines = [
    `📞 *Yangi AI suhbat*`,
    `⏱ Davomiyligi: ${s.durationSeconds} sekund`,
    `📱 Raqam: \`${s.phone || "noma'lum"}\``,
    "",
    `*Mijoz ma'lumoti:*`,
    `• Muammo: ${c.issue ?? "—"}`,
    `• Shahar: ${c.city ?? "—"}`,
    `• Filial: ${c.branch ?? "—"}`,
    `• Qulay vaqt: ${c.preferred_time ?? "—"}`,
    `• Til: ${c.language === "ru" ? "Rus" : "O'zbek"}`,
    `• Holat tugashi: \`${s.endReason}\``,
    "",
    s.notes ? `*Izoh:* ${s.notes}` : "",
    conv ? `*Suhbat (oxirgi 12):*\n${conv}` : "",
  ];
  return lines.filter(Boolean).join("\n");
}

function shortAssistant(raw: string): string {
  // The assistant message is the raw JSON envelope — extract just `speak`.
  try {
    const parsed = JSON.parse(raw) as { speak?: string };
    return parsed.speak ?? raw.slice(0, 140);
  } catch {
    return raw.slice(0, 140);
  }
}
