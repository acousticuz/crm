import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { HealthModule } from "./modules/health/health.module";
import { PrismaModule } from "./modules/prisma/prisma.module";

// Domain module stubs — implementations fill in across future milestones (M1+).
import { AuthModule } from "./modules/auth/auth.module";
import { TenantsModule } from "./modules/tenants/tenants.module";
import { UsersModule } from "./modules/users/users.module";
import { ContactsModule } from "./modules/contacts/contacts.module";
import { LeadsModule } from "./modules/leads/leads.module";
import { PipelinesModule } from "./modules/pipelines/pipelines.module";
import { CardsModule } from "./modules/cards/cards.module";
import { TagsModule } from "./modules/tags/tags.module";
import { TasksModule } from "./modules/tasks/tasks.module";
import { CallsModule } from "./modules/calls/calls.module";
import { SmsModule } from "./modules/sms/sms.module";
import { TriggersModule } from "./modules/triggers/triggers.module";
import { QaModule } from "./modules/qa/qa.module";
import { AnalyticsModule } from "./modules/analytics/analytics.module";
import { InboxModule } from "./modules/inbox/inbox.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: [".env", "../../.env"] }),
    PrismaModule,
    HealthModule,
    AuthModule,
    TenantsModule,
    UsersModule,
    ContactsModule,
    LeadsModule,
    PipelinesModule,
    CardsModule,
    TagsModule,
    TasksModule,
    CallsModule,
    SmsModule,
    TriggersModule,
    QaModule,
    AnalyticsModule,
    InboxModule,
  ],
})
export class AppModule {}
