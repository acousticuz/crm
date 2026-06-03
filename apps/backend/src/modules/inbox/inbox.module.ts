import { Module } from "@nestjs/common";
import { InboxService } from "./inbox.service";
import { InboxController } from "./inbox.controller";
import { InboxWebhookGuard } from "./inbox-webhook.guard";
import { TelegramWebhookGuard } from "./telegram-webhook.guard";
import { TenantsModule } from "../tenants/tenants.module";

@Module({
  imports: [TenantsModule],
  controllers: [InboxController],
  providers: [InboxService, InboxWebhookGuard, TelegramWebhookGuard],
  exports: [InboxService],
})
export class InboxModule {}
