import { Injectable, Logger } from "@nestjs/common";
import { SmsStatus } from "@acoustic-crm/shared";
import type {
  SmsAdapter,
  SmsAdapterContext,
  SmsSendInput,
  SmsSendResult,
} from "./sms-adapter";

/**
 * In-memory provider used for tests, local development, and tenants without
 * a real provider configured. Stores sent messages on the instance so tests
 * can assert on them.
 */
@Injectable()
export class MockSmsAdapter implements SmsAdapter {
  readonly name = "mock";
  readonly sent: Array<{ phone: string; text: string; id: string }> = [];
  // Last provider config received — lets tests assert which credentials the
  // service resolved (e.g. from the SMS Integration row).
  lastConfig: Record<string, unknown> | null = null;
  private readonly logger = new Logger(MockSmsAdapter.name);
  private counter = 0;

  async send(
    input: SmsSendInput,
    cfg?: Record<string, unknown>,
    _ctx?: SmsAdapterContext,
  ): Promise<SmsSendResult> {
    void _ctx;
    this.counter += 1;
    this.lastConfig = cfg ?? null;
    const id = `mock-${Date.now()}-${this.counter}`;
    this.sent.push({ phone: input.phone, text: input.text, id });
    this.logger.debug?.(`MOCK SMS → ${input.phone}: ${input.text}`);
    return { status: SmsStatus.SENT, providerMessageId: id };
  }

  reset(): void {
    this.sent.length = 0;
    this.counter = 0;
    this.lastConfig = null;
  }
}
