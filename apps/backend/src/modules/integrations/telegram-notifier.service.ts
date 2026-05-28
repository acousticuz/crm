import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { IntegrationType } from "@acoustic-crm/shared";
import { TriggerEngine } from "../triggers/trigger.engine";
import { IntegrationsService } from "./integrations.service";

/**
 * Sends Telegram notifications using the tenant's saved TELEGRAM Integration
 * (bot token + default chat id), decrypted at call time. Registers itself with
 * the trigger engine so the `telegram` trigger action routes through here —
 * same indirection used by SmsService to avoid a circular import.
 */
@Injectable()
export class TelegramNotifierService implements OnModuleInit {
  private readonly logger = new Logger(TelegramNotifierService.name);

  constructor(
    private readonly integrations: IntegrationsService,
    private readonly engine: TriggerEngine,
  ) {}

  onModuleInit(): void {
    this.engine.registerTelegramHandler({
      notify: async (input) => this.notify(input),
    });
  }

  /** Decrypted bot token from the tenant's saved Integration, or null. */
  async resolveBotToken(tenantId: string): Promise<string | null> {
    const cfg = await this.integrations.getDecryptedConfig(tenantId, IntegrationType.TELEGRAM);
    const token = cfg ? String(cfg.botToken ?? "") : "";
    return token || null;
  }

  /** Default chat id saved on the Integration, or null. */
  async resolveChatId(tenantId: string): Promise<string | null> {
    const cfg = await this.integrations.getDecryptedConfig(tenantId, IntegrationType.TELEGRAM);
    const chatId = cfg ? String(cfg.chatId ?? "") : "";
    return chatId || null;
  }

  async notify(input: { tenantId: string; text: string; chatId?: string }): Promise<boolean> {
    const token = await this.resolveBotToken(input.tenantId);
    const chatId = input.chatId ?? (await this.resolveChatId(input.tenantId));
    if (!token || !chatId) {
      this.logger.warn(
        `Telegram notify skipped — bot token or chat id not configured for tenant ${input.tenantId}`,
      );
      return false;
    }
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: input.text }),
      });
      return res.ok;
    } catch (err) {
      this.logger.error(`Telegram send failed: ${(err as Error).message}`);
      return false;
    }
  }
}
