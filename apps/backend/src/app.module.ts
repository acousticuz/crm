import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { ClsModule } from "nestjs-cls";
import { EventEmitterModule } from "@nestjs/event-emitter";

import { HttpExceptionFilter } from "./common/filters/http-exception.filter";
import { JwtAuthGuard } from "./common/guards/jwt-auth.guard";
import { RolesGuard } from "./common/guards/roles.guard";

import { HealthModule } from "./modules/health/health.module";
import { PrismaModule } from "./modules/prisma/prisma.module";
import { AuditModule } from "./modules/audit/audit.module";
import { AuditInterceptor } from "./modules/audit/audit.interceptor";
import { RealtimeModule } from "./modules/realtime/realtime.module";
import { NotesModule } from "./modules/notes/notes.module";
import { QueueModule } from "./modules/queue/queue.module";
import { TranscriptsModule } from "./modules/transcripts/transcripts.module";

import { AuthModule } from "./modules/auth/auth.module";
import { TenantsModule } from "./modules/tenants/tenants.module";
import { UsersModule } from "./modules/users/users.module";
import { IntegrationsModule } from "./modules/integrations/integrations.module";

// Future-milestone stubs (implementations in M2+).
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
import { AcousticSyncModule } from "./modules/acoustic-sync/acoustic-sync.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: [".env", "../../.env"] }),
    ClsModule.forRoot({
      global: true,
      middleware: { mount: true, generateId: true },
    }),
    EventEmitterModule.forRoot({ wildcard: true }),
    PrismaModule,
    AuditModule,
    RealtimeModule,
    QueueModule,
    HealthModule,
    AuthModule,
    TenantsModule,
    UsersModule,
    IntegrationsModule,
    ContactsModule,
    LeadsModule,
    PipelinesModule,
    CardsModule,
    TagsModule,
    TasksModule,
    NotesModule,
    TranscriptsModule,
    CallsModule,
    SmsModule,
    TriggersModule,
    QaModule,
    AnalyticsModule,
    InboxModule,
    AcousticSyncModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
