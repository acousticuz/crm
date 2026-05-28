import { Module } from "@nestjs/common";
import { SmsService } from "./sms.service";
import { SmsController } from "./sms.controller";
import { SmsAdapterFactory } from "./sms-adapter.factory";
import { SmsRateLimiter } from "./rate-limiter";
import { MockSmsAdapter } from "./adapters/mock.adapter";
import { EskizSmsAdapter } from "./adapters/eskiz.adapter";
import { PlayMobileSmsAdapter } from "./adapters/playmobile.adapter";

@Module({
  controllers: [SmsController],
  providers: [
    SmsService,
    SmsAdapterFactory,
    SmsRateLimiter,
    MockSmsAdapter,
    EskizSmsAdapter,
    PlayMobileSmsAdapter,
  ],
  exports: [SmsService],
})
export class SmsModule {}
