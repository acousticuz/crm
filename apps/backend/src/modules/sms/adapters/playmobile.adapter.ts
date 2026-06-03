import { Injectable, Logger } from "@nestjs/common";
import { SmsStatus } from "@acoustic-crm/shared";
import type {
  SmsAdapter,
  SmsAdapterContext,
  SmsSendInput,
  SmsSendResult,
} from "./sms-adapter";

interface PlayConfig {
  baseUrl?: string;
  login?: string;
  password?: string;
  originator?: string;
}

/**
 * Play Mobile (broker-api) SMS adapter. Uses HTTP basic auth. Endpoint sends
 * a JSON payload containing a message id, recipient, and SMS body.
 *
 * Docs: https://playmobile.uz/ — broker-api spec.
 */
@Injectable()
export class PlayMobileSmsAdapter implements SmsAdapter {
  readonly name = "playmobile";
  private readonly logger = new Logger(PlayMobileSmsAdapter.name);

  async send(
    input: SmsSendInput,
    cfg: Record<string, unknown>,
    _ctx: SmsAdapterContext,
  ): Promise<SmsSendResult> {
    void _ctx;
    const config = cfg as PlayConfig;
    const baseUrl = (
      config.baseUrl ?? process.env.PLAYMOBILE_BASE_URL ?? "https://send.smsxabar.uz/broker-api"
    ).replace(/\/$/, "");
    if (!config.login || !config.password) {
      return {
        status: SmsStatus.FAILED,
        providerMessageId: null,
        errorMessage: "Play Mobile: login/password not configured",
      };
    }
    const msgId = `acoustic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const payload = {
      messages: [
        {
          recipient: input.phone.replace(/^\+/, ""),
          "message-id": msgId,
          sms: {
            originator: config.originator ?? "3700",
            content: { text: input.text },
          },
        },
      ],
    };
    try {
      const res = await fetch(`${baseUrl}/send`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${config.login}:${config.password}`).toString("base64")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        return {
          status: SmsStatus.FAILED,
          providerMessageId: null,
          errorMessage: `HTTP ${res.status} ${errText.slice(0, 200)}`,
        };
      }
      return { status: SmsStatus.SENT, providerMessageId: msgId };
    } catch (err) {
      this.logger.error(`Play Mobile send failed: ${(err as Error).message}`);
      return {
        status: SmsStatus.FAILED,
        providerMessageId: null,
        errorMessage: (err as Error).message,
      };
    }
  }
}
