import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { ClsModule } from "nestjs-cls";

import { HttpExceptionFilter } from "./common/filters/http-exception.filter";
import { JwtAuthGuard } from "./common/guards/jwt-auth.guard";
import { RolesGuard } from "./common/guards/roles.guard";

import { HealthModule } from "./modules/health/health.module";
import { PrismaModule } from "./modules/prisma/prisma.module";
import { AuditModule } from "./modules/audit/audit.module";
import { AuditInterceptor } from "./modules/audit/audit.interceptor";

import { AuthModule } from "./modules/auth/auth.module";
import { TenantsModule } from "./modules/tenants/tenants.module";
import { UsersModule } from "./modules/users/users.module";

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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: [".env", "../../.env"] }),
    ClsModule.forRoot({
      global: true,
      middleware: { mount: true, generateId: true },
    }),
    PrismaModule,
    AuditModule,
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
  providers: [
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
