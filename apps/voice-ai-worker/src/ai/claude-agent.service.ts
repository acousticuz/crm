import { FEW_SHOT_EXAMPLES, SYSTEM_PROMPT } from "./system-prompt";

export type AiAction = "continue" | "collect_info" | "save_to_crm" | "transfer" | "end";
export type AiConfidence = "real_client" | "maybe" | "not_client";

export interface CollectedData {
  phone?: string | null;
  city?: string | null;
  branch?: string | null;
  branchId?: number | null;
  issue?: string | null;
  preferred_time?: string | null;
  is_existing_client?: boolean | null;
  language?: "uz" | "ru" | null;
}

export interface AiTurn {
  role: "user" | "assistant";
  content: string;
}

export interface AgentTurnInput {
  conversation: AiTurn[];
  userSpeech: string;
  callerPhone: string;
  collectedSoFar: CollectedData;
  language?: "uz" | "ru" | "en";
}

export interface AgentTurnResult {
  speak: string;
  action: AiAction;
  collected: CollectedData;
  confidence: AiConfidence;
  notes?: string;
}

interface AnthropicResponse {
  content?: Array<{ text?: string }>;
}

const ACTIONS = new Set<AiAction>(["continue", "collect_info", "save_to_crm", "transfer", "end"]);
const CONFIDENCES = new Set<AiConfidence>(["real_client", "maybe", "not_client"]);

/**
 * Drives the Claude conversation that powers the AI receptionist. One turn
 * goes in (user speech + history), one JSON envelope comes back. The envelope
 * format is enforced by the system prompt; we parse defensively and clamp
 * any field outside the allowed enum to a safe default.
 *
 * Model: `claude-opus-4-7` by default — same family the rest of the CRM uses.
 * Override via env `VOICE_AI_CLAUDE_MODEL` for cheaper/faster experiments.
 */
export class ClaudeAgentService {
  constructor(
    private readonly config: {
      apiKey: string;
      model?: string;
      /** Cap conversation history we resend each turn (keeps prompt cheap). */
      historyTurns?: number;
    },
  ) {}

  async respond(input: AgentTurnInput): Promise<AgentTurnResult> {
    if (!this.config.apiKey) {
      throw new Error("ClaudeAgentService: ANTHROPIC_API_KEY is required");
    }

    const messages = this.buildMessages(input);
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": this.config.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.config.model ?? "claude-opus-4-7",
        max_tokens: 800,
        system: SYSTEM_PROMPT,
        messages,
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Claude HTTP ${res.status}: ${errText.slice(0, 200)}`);
    }
    const body = (await res.json()) as AnthropicResponse;
    const raw = body.content?.[0]?.text ?? "";
    return this.parseTurn(raw, input);
  }

  private buildMessages(input: AgentTurnInput): Array<{ role: "user" | "assistant"; content: string }> {
    const out: Array<{ role: "user" | "assistant"; content: string }> = [];
    // Anchor with the few-shot examples — they teach the JSON envelope.
    for (const ex of FEW_SHOT_EXAMPLES) {
      out.push({ role: "user", content: ex.user });
      out.push({ role: "assistant", content: ex.assistant });
    }
    // Inject a control message that pins what we've already collected so
    // Claude doesn't re-ask for the phone we already have, etc.
    const collectedJson = JSON.stringify(input.collectedSoFar ?? {});
    const phoneNote = input.callerPhone
      ? `Qo'ng'iroq qilgan raqam: ${input.callerPhone}.`
      : "Qo'ng'iroq qilgan raqam ko'rinmadi.";
    out.push({
      role: "user",
      content:
        `[Tizim eslatmasi — mijozga aytma]\n` +
        `${phoneNote}\n` +
        `Hozirgacha yig'ilgan ma'lumot: ${collectedJson}.`,
    });
    out.push({ role: "assistant", content: '{"speak":"...", "action":"continue"}' });

    // Replay actual conversation history (truncated to keep prompt small).
    const limit = this.config.historyTurns ?? 12;
    const start = Math.max(0, input.conversation.length - limit);
    for (const t of input.conversation.slice(start)) {
      out.push({ role: t.role, content: t.content });
    }
    // The new user utterance.
    out.push({ role: "user", content: input.userSpeech });
    return out;
  }

  private parseTurn(raw: string, input: AgentTurnInput): AgentTurnResult {
    let json: Record<string, unknown>;
    try {
      json = extractJson(raw);
    } catch (err) {
      // Bad JSON — degrade to a safe "let me transfer you" rather than
      // hanging up on the customer with silence.
      console.error(`[voice-ai] Claude returned non-JSON: ${(err as Error).message}`);
      return {
        speak:
          "Sizni xodimimizga ulayman. Iltimos, bir oz kuting yoki ertaga qayta bog'laning.",
        action: "end",
        collected: input.collectedSoFar,
        confidence: "maybe",
        notes: "LLM JSON parse failed",
      };
    }
    const action = ACTIONS.has(json.action as AiAction)
      ? (json.action as AiAction)
      : "continue";
    const confidence = CONFIDENCES.has(json.confidence as AiConfidence)
      ? (json.confidence as AiConfidence)
      : "maybe";
    const collected = sanitizeCollected(json.collected, input.collectedSoFar);
    const speak = String(json.speak ?? "").trim();
    return {
      speak: speak || "Sizni eshityapman, davom eting.",
      action,
      collected,
      confidence,
      notes: typeof json.notes === "string" ? json.notes : undefined,
    };
  }
}

function extractJson(text: string): Record<string, unknown> {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("no JSON object");
  return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
}

function sanitizeCollected(raw: unknown, fallback: CollectedData): CollectedData {
  if (!raw || typeof raw !== "object") return fallback;
  const r = raw as Record<string, unknown>;
  const lang =
    r.language === "uz" || r.language === "ru" ? (r.language as "uz" | "ru") : fallback.language ?? null;
  const out: CollectedData = {
    phone: typeof r.phone === "string" ? r.phone : fallback.phone ?? null,
    city: typeof r.city === "string" ? r.city : fallback.city ?? null,
    branch: typeof r.branch === "string" ? r.branch : fallback.branch ?? null,
    branchId: typeof r.branchId === "number" ? r.branchId : fallback.branchId ?? null,
    issue: typeof r.issue === "string" ? r.issue : fallback.issue ?? null,
    preferred_time:
      typeof r.preferred_time === "string" ? r.preferred_time : fallback.preferred_time ?? null,
    is_existing_client:
      typeof r.is_existing_client === "boolean"
        ? r.is_existing_client
        : fallback.is_existing_client ?? null,
    language: lang,
  };
  return out;
}
