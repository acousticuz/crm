import { Global, Module } from "@nestjs/common";
import { IntegrationsService } from "./integrations.service";
import { IntegrationsController } from "./integrations.controller";
import { TelegramNotifierService } from "./telegram-notifier.service";

// Global so SMS, inbox, calls, and triggers can resolve decrypted integration
// config at runtime without importing this module everywhere.
@Global()
@Module({
  controllers: [IntegrationsController],
  providers: [IntegrationsService, TelegramNotifierService],
  exports: [IntegrationsService, TelegramNotifierService],
})
export class IntegrationsModule {}
