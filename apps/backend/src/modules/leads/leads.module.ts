import { Module } from "@nestjs/common";
import { LeadsService } from "./leads.service";
import { LeadsController } from "./leads.controller";
import { WebhookGuard } from "./webhook.guard";
import { ContactsModule } from "../contacts/contacts.module";
import { TenantsModule } from "../tenants/tenants.module";

@Module({
  imports: [ContactsModule, TenantsModule],
  controllers: [LeadsController],
  providers: [LeadsService, WebhookGuard],
  exports: [LeadsService],
})
export class LeadsModule {}
