import "reflect-metadata";
import { Test, TestingModule } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { ClsModule, ClsService } from "nestjs-cls";
import { IntegrationType, UserRole } from "@acoustic-crm/shared";
import { PrismaService } from "../src/modules/prisma/prisma.service";
import { AuditService } from "../src/modules/audit/audit.service";
import { RealtimeService } from "../src/modules/realtime/realtime.service";
import { IntegrationsService } from "../src/modules/integrations/integrations.service";
import { TelegramNotifierService } from "../src/modules/integrations/telegram-notifier.service";
import { InboxService } from "../src/modules/inbox/inbox.service";
import { SmsService } from "../src/modules/sms/sms.service";
import { SmsAdapterFactory } from "../src/modules/sms/sms-adapter.factory";
import { SmsRateLimiter } from "../src/modules/sms/rate-limiter";
import { MockSmsAdapter } from "../src/modules/sms/adapters/mock.adapter";
import { EskizSmsAdapter } from "../src/modules/sms/adapters/eskiz.adapter";
import { EskizTokenCacheService } from "../src/modules/sms/adapters/eskiz-token-cache.service";
import { PlayMobileSmsAdapter } from "../src/modules/sms/adapters/playmobile.adapter";
import { TriggersService } from "../src/modules/triggers/triggers.service";
import { TriggerEngine } from "../src/modules/triggers/trigger.engine";
import { CallsService } from "../src/modules/calls/calls.service";
import { ContactsService } from "../src/modules/contacts/contacts.service";
import { writeContext } from "../src/common/tenant-context";

// ENCRYPTION_KEY must be set before crypto is first used.
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? "test-encryption-key-32-bytes-long!!";

describe("Integrations wired into runtime — saved config drives behavior", () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let cls: ClsService;
  let integrations: IntegrationsService;
  let telegram: TelegramNotifierService;
  let inbox: InboxService;
  let sms: SmsService;
  let mock: MockSmsAdapter;
  let limiter: SmsRateLimiter;
  let calls: CallsService;

  let tenantId: string;
  let userId: string;

  const runId = `intrt-${Date.now()}`;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        ClsModule.forRoot({ global: true }),
        EventEmitterModule.forRoot({ wildcard: true }),
      ],
      providers: [
        PrismaService,
        AuditService,
        RealtimeService,
        IntegrationsService,
        TelegramNotifierService,
        ContactsService,
        InboxService,
        SmsService,
        SmsAdapterFactory,
        SmsRateLimiter,
        MockSmsAdapter,
        EskizSmsAdapter,
        EskizTokenCacheService,
        PlayMobileSmsAdapter,
        TriggersService,
        TriggerEngine,
        CallsService,
      ],
    }).compile();
    await moduleRef.init();

    cls = moduleRef.get(ClsService);
    prisma = moduleRef.get(PrismaService);
    integrations = moduleRef.get(IntegrationsService);
    telegram = moduleRef.get(TelegramNotifierService);
    inbox = moduleRef.get(InboxService);
    sms = moduleRef.get(SmsService);
    mock = moduleRef.get(MockSmsAdapter);
    limiter = moduleRef.get(SmsRateLimiter);
    calls = moduleRef.get(CallsService);
    await prisma.$connect();

    const t = await prisma.tenant.create({
      data: {
        name: `${runId}-tenant`,
        status: "ACTIVE",
        // Legacy fallback used until an SMS Integration is configured.
        // allowFreeText keeps the runtime fallback test compatible with the
        // new template-only default — these tests assert credential routing,
        // not the template rule.
        smsConfig: { provider: "mock", login: "legacy-login", allowFreeText: true },
      },
    });
    tenantId = t.id;
    const user = await prisma.user.create({
      data: {
        tenantId,
        fullName: "Runtime Admin",
        email: `${runId}-admin@test.local`,
        passwordHash: "x",
        role: "TENANT_ADMIN",
        status: "ACTIVE",
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.smsLog.deleteMany({ where: { tenantId } });
    await prisma.auditLog.deleteMany({ where: { tenantId } });
    await prisma.integration.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
    await moduleRef.close();
  });

  function asTenant<T>(fn: () => Promise<T>): Promise<T> {
    return cls.run(async () => {
      writeContext(cls, {
        tenantId,
        userId,
        role: UserRole.TENANT_ADMIN,
        email: "admin@test.local",
        skipTenantFilter: false,
      });
      return fn();
    });
  }

  beforeEach(() => {
    mock.reset();
    limiter.reset();
  });

  // ===== SMS =====

  it("SMS falls back to Tenant.smsConfig when no Integration exists", async () => {
    const log = await asTenant(() => sms.sendManual({ phone: "+998901110001", text: "hi" }));
    expect(log.provider).toBe("mock");
    expect(mock.lastConfig?.login).toBe("legacy-login");
  });

  it("SMS uses the saved Integration once configured (Integration wins)", async () => {
    await asTenant(() =>
      integrations.upsert(IntegrationType.SMS, {
        provider: "mock",
        config: {
          provider: "mock",
          login: "u1",
          password: "p1",
          sender: "S1",
          // Routing test — allow free text so we can exercise the simple path.
          allowFreeText: true,
        },
      }),
    );
    const log = await asTenant(() => sms.sendManual({ phone: "+998901110002", text: "hi" }));
    expect(log.provider).toBe("mock");
    expect(mock.lastConfig?.login).toBe("u1");
    expect(mock.lastConfig?.sender).toBe("S1");
  });

  it("updating the SMS Integration changes which credentials are used", async () => {
    await asTenant(() =>
      integrations.upsert(IntegrationType.SMS, {
        provider: "mock",
        config: {
          provider: "mock",
          login: "u2",
          password: "p2",
          sender: "S2",
          allowFreeText: true,
        },
      }),
    );
    const log = await asTenant(() => sms.sendManual({ phone: "+998901110003", text: "hi" }));
    expect(mock.lastConfig?.login).toBe("u2");
    expect(mock.lastConfig?.login).toBe("u2");
    expect(log.provider).toBe("mock");
  });

  // ===== Telegram =====

  it("Telegram notifier reads the saved bot token + chat id, and reflects updates", async () => {
    await asTenant(() =>
      integrations.upsert(IntegrationType.TELEGRAM, {
        config: { botToken: "111:aaa", chatId: "555", purpose: "supervisor" },
      }),
    );
    expect(await telegram.resolveBotToken(tenantId)).toBe("111:aaa");
    expect(await telegram.resolveChatId(tenantId)).toBe("555");

    await asTenant(() =>
      integrations.upsert(IntegrationType.TELEGRAM, {
        config: { botToken: "222:bbb", chatId: "666", purpose: "supervisor" },
      }),
    );
    expect(await telegram.resolveBotToken(tenantId)).toBe("222:bbb");
    expect(await telegram.resolveChatId(tenantId)).toBe("666");
  });

  // ===== Inbox =====

  it("Inbox reads the saved page access token, and reflects updates", async () => {
    await asTenant(() =>
      integrations.upsert(IntegrationType.INBOX, {
        provider: "facebook",
        config: { provider: "facebook", pageId: "p1", pageName: "P", pageAccessToken: "tok-1" },
      }),
    );
    expect(await inbox.resolveInboxToken(tenantId)).toBe("tok-1");

    await asTenant(() =>
      integrations.upsert(IntegrationType.INBOX, {
        provider: "facebook",
        config: { provider: "facebook", pageId: "p1", pageName: "P", pageAccessToken: "tok-2" },
      }),
    );
    expect(await inbox.resolveInboxToken(tenantId)).toBe("tok-2");
  });

  // ===== FreePBX (telephony worker source) =====

  it("telephony worker resolver returns saved AMI creds and a new fingerprint on update", async () => {
    await asTenant(() =>
      integrations.upsert(IntegrationType.FREEPBX, {
        config: { amiHost: "10.0.0.9", amiPort: 5038, amiUsername: "acoustic", amiSecret: "sec-1" },
      }),
    );
    const first = (await calls.freePbxConfigsForWorker()).find((c) => c.tenantId === tenantId);
    expect(first).toBeDefined();
    expect(first!.host).toBe("10.0.0.9");
    expect(first!.username).toBe("acoustic");
    expect(first!.secret).toBe("sec-1");

    await asTenant(() =>
      integrations.upsert(IntegrationType.FREEPBX, {
        config: { amiHost: "10.0.0.9", amiPort: 5038, amiUsername: "acoustic", amiSecret: "sec-2" },
      }),
    );
    const second = (await calls.freePbxConfigsForWorker()).find((c) => c.tenantId === tenantId);
    expect(second!.secret).toBe("sec-2");
    expect(second!.fingerprint).not.toBe(first!.fingerprint);
  });
});
