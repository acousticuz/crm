import axios, { type AxiosInstance } from "axios";
import { CallDirection, CallStatus } from "@acoustic-crm/shared";
import type { AiTurn, CollectedData } from "../ai/claude-agent.service";

export interface CaptureAiCallInput {
  tenantId: string;
  callerPhone: string;
  cdrUniqueId: string;
  dnid: string;
  startedAt: string;
  durationSeconds: number;
  collected: CollectedData;
  notes: string;
  transcript: AiTurn[];
}

/**
 * CRM-side wiring for an AI-handled call. Talks to the CRM backend through
 * its existing `/api/v1/internal/calls/*` endpoints (no new backend modules),
 * so the call shows up in Kanban / Calls list exactly like any FreePBX call:
 *
 *   1. POST /internal/calls/started   → Call row created in RINGING. The
 *      existing `resolveOrCreateContact` logic in the backend auto-creates
 *      a "Noma'lum" contact if the number is new — no extra work for us.
 *   2. POST /internal/calls/completed → final ANSWERED + duration. This also
 *      runs the existing trigger engine (e.g. screen-pop, MISSED→task).
 *   3. If a tenant webhook secret is configured (env), we additionally POST
 *      the AI-collected data to /api/v1/leads/webhook/:tenantId/voice-ai so
 *      the human follow-up gets all of {city, branch, issue, preferred_time}
 *      pre-populated. Without the secret we skip this — the basic call row
 *      is still saved and the Telegram notifier provides the details.
 */
export class CrmBridge {
  private readonly internal: AxiosInstance;
  private readonly leadsBase: string;

  constructor(
    private readonly opts: {
      backendBaseUrl: string;
      sharedSecret: string;
      /** Map of tenantId → webhook secret. Optional. */
      webhookSecrets?: Record<string, string>;
    },
  ) {
    const base = opts.backendBaseUrl.replace(/\/$/, "");
    this.internal = axios.create({
      baseURL: `${base}/api/v1/internal/calls`,
      headers: { "X-Worker-Secret": opts.sharedSecret },
      timeout: 5000,
    });
    this.leadsBase = `${base}/api/v1/leads/webhook`;
  }

  /**
   * Record an AI-handled call lifecycle end-to-end. Called once per call, at
   * the moment the AI hands the conversation back (end / save_to_crm /
   * transfer / hangup). Idempotent on (tenantId, cdrUniqueId).
   */
  async captureAiCall(input: CaptureAiCallInput): Promise<void> {
    // 1) Lifecycle — RINGING then ANSWERED.  The backend's existing logic
    // creates the Contact and Card if needed.
    const inboundNumber = process.env.VOICE_AI_INBOUND_NUMBER ?? input.dnid ?? "ai";
    await this.safe("started", () =>
      this.internal.post("/started", {
        tenantId: input.tenantId,
        cdrUniqueId: input.cdrUniqueId,
        direction: CallDirection.INBOUND,
        fromNumber: input.callerPhone || "unknown",
        toNumber: inboundNumber,
        startedAt: input.startedAt,
      }),
    );

    await this.safe("completed", () =>
      this.internal.post("/completed", {
        tenantId: input.tenantId,
        cdrUniqueId: input.cdrUniqueId,
        direction: CallDirection.INBOUND,
        fromNumber: input.callerPhone || "unknown",
        toNumber: inboundNumber,
        status: CallStatus.ANSWERED,
        startedAt: input.startedAt,
        duration: input.durationSeconds,
      }),
    );

    // 2) Webhook lead capture (optional — needs the tenant's webhookSecret).
    const secret = this.opts.webhookSecrets?.[input.tenantId];
    if (secret) {
      await this.safe("lead", () =>
        axios.post(
          `${this.leadsBase}/${input.tenantId}/voice-ai`,
          this.buildLeadPayload(input),
          {
            headers: { "X-Webhook-Secret": secret, "Content-Type": "application/json" },
            timeout: 5000,
          },
        ),
      );
    }
  }

  private buildLeadPayload(input: CaptureAiCallInput) {
    const c = input.collected;
    const fullName =
      c.is_existing_client === true
        ? `Mavjud mijoz (${input.callerPhone})`
        : "Voice-AI suhbat";
    const customNote = [
      c.issue ? `Muammo: ${c.issue}` : null,
      c.city ? `Shahar: ${c.city}` : null,
      c.branch ? `Filial: ${c.branch}` : null,
      c.preferred_time ? `Qulay vaqt: ${c.preferred_time}` : null,
      c.language ? `Til: ${c.language}` : null,
      input.notes ? `Izoh: ${input.notes}` : null,
    ]
      .filter(Boolean)
      .join("\n");
    return {
      fullName,
      phone: input.callerPhone,
      source: "voice-ai",
      // The lead webhook accepts arbitrary `rawData` JSON, which the operator
      // sees on the Lead detail panel. We embed everything Claude collected so
      // the human follow-up has full context.
      rawData: {
        cdrUniqueId: input.cdrUniqueId,
        startedAt: input.startedAt,
        durationSeconds: input.durationSeconds,
        collected: c,
        notes: input.notes,
        transcript: input.transcript,
        summary: customNote,
      },
    };
  }

  /**
   * Wrap an HTTP call so a CRM outage never crashes the worker — we always
   * log the failure and continue. The Telegram notifier is the redundant
   * channel for the human follow-up.
   */
  private async safe(label: string, action: () => Promise<unknown>): Promise<void> {
    try {
      await action();
    } catch (err) {
      const detail = axios.isAxiosError(err)
        ? `HTTP ${err.response?.status ?? "?"} ${JSON.stringify(err.response?.data ?? {}).slice(0, 200)}`
        : (err as Error).message;
      console.error(`[voice-ai] CRM bridge ${label} failed: ${detail}`);
    }
  }
}
