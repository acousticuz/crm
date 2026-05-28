import { Injectable, Logger } from "@nestjs/common";
import { SmsStatus } from "@acoustic-crm/shared";
import type { SmsAdapter, SmsSendInput, SmsSendResult } from "./sms-adapter";

/**
 * In-memory provider used for tests, local development, and tenants without
 * a real provider configured. Stores sent messages on the instance so tests
 * can assert on them.
 */
@Injectable()
export class MockSmsAdapter implements SmsAdapter {
  readonly name = "mock";
  readonly sent: Array<{ phone: string; text: string; id: string }> = [];
  private readonly logger = new Logger(MockSmsAdapter.name);
  private counter = 0;

  async send(input: SmsSendInput): Promise<SmsSendResult> {
    this.counter += 1;
    const id = `mock-${Date.now()}-${this.counter}`;
    this.sent.push({ phone: input.phone, text: input.text, id });
    this.logger.debug?.(`MOCK SMS → ${input.phone}: ${input.text}`);
    return { status: SmsStatus.SENT, providerMessageId: id };
  }

  reset(): void {
    this.sent.length = 0;
    this.counter = 0;
  }
}
