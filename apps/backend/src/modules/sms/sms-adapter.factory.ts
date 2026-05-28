import { Injectable } from "@nestjs/common";
import type { SmsAdapter } from "./adapters/sms-adapter";
import { MockSmsAdapter } from "./adapters/mock.adapter";
import { EskizSmsAdapter } from "./adapters/eskiz.adapter";
import { PlayMobileSmsAdapter } from "./adapters/playmobile.adapter";

@Injectable()
export class SmsAdapterFactory {
  private readonly registry: Record<string, SmsAdapter>;

  constructor(
    public readonly mock: MockSmsAdapter,
    eskiz: EskizSmsAdapter,
    play: PlayMobileSmsAdapter,
  ) {
    this.registry = {
      [mock.name]: mock,
      [eskiz.name]: eskiz,
      [play.name]: play,
    };
  }

  pick(provider: string | undefined | null): SmsAdapter {
    if (provider && this.registry[provider]) return this.registry[provider];
    return this.mock;
  }
}
