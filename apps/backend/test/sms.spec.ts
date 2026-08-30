import "reflect-metadata";
import { Test, TestingModule } from "@nestjs/testing";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { ClsModule, ClsService } from "nestjs-cls";
import { UserRole, SmsStatus } from "@acoustic-crm/shared";
import { PrismaService } from "../src/modules/prisma/prisma.service";
import { RealtimeService } from "../src/modules/realtime/realtime.service";
import { AuditService } from "../src/modules/audit/audit.service";
import { IntegrationsService } from "../src/modules/integrations/integrations.service";
import { TriggersService } from "../src/modules/triggers/triggers.service";
import { TriggerEngine } from "../src/modules/triggers/trigger.engine";
import { SmsService, TooManyRequestsException } from "../src/modules/sms/sms.service";
import { SmsAdapterFactory } from "../src/modules/sms/sms-adapter.factory";
import { SmsRateLimiter } from "../src/modules/sms/rate-limiter";
import { MockSmsAdapter } from "../src/modules/sms/adapters/mock.adapter";
import { EskizSmsAdapter } from "../src/modules/sms/adapters/eskiz.adapter";
import { EskizTokenCacheService } from "../src/modules/sms/adapters/eskiz-token-cache.service";
import { PlayMobileSmsAdapter } from "../src/modules/sms/adapters/playmobile.adapter";
import { CardsService } from "../src/modules/cards/cards.service";
import { ContactsService } from "../src/modules/contacts/contacts.service";
import { interpolate } from "../src/modules/sms/template";
import { writeContext } from "../src/common/tenant-context";

describe("M5 — SMS adapters, templates, rate limit, trigger action", () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let cls: ClsService;
  let sms: SmsService;
  let mock: MockSmsAdapter;
  let limiter: SmsRateLimiter;
  let cards: CardsService;
  let triggers: TriggersService;

  let tenantId: string;
  let userId: string;
  let contactId: string;
  let pipelineId: string;
  let stageId: string;

  const runId = `m5-${Date.now()}`;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ClsModule.forRoot({ global: true }),
        EventEmitterModule.forRoot({ wildcard: true }),
      ],
      providers: [
        PrismaService,
        RealtimeService,
        AuditService,
        IntegrationsService,
        TriggersService,
        TriggerEngine,
        SmsService,
        SmsAdapterFactory,
        SmsRateLimiter,
        MockSmsAdapter,
        EskizSmsAdapter,
        // The Eskiz adapter now depends on the tenant-scoped JWT cache.
        EskizTokenCacheService,
        PlayMobileSmsAdapter,
        CardsService,
        ContactsService,
      ],
    }).compile();

    // init() triggers lifecycle hooks — wires @OnEvent decorators on the
    // engine and runs onModuleInit on SmsService (registers SMS handler).
    await moduleRef.init();

    cls = moduleRef.get(ClsService);
    prisma = moduleRef.get(PrismaService);
    sms = moduleRef.get(SmsService);
    mock = moduleRef.get(MockSmsAdapter);
    limiter = moduleRef.get(SmsRateLimiter);
    cards = moduleRef.get(CardsService);
    triggers = moduleRef.get(TriggersService);
    const engine = moduleRef.get(TriggerEngine);
    expect(engine).toBeDefined();

    await prisma.$connect();

    const t = await prisma.tenant.create({
      data: {
        name: `${runId}-tenant`,
        status: "ACTIVE",
        // Existing tests rely on free-text sends; template-only is enforced
        // separately in the eskiz-specific cases.
        smsConfig: { provider: "mock", allowFreeText: true },
      },
    });
    tenantId = t.id;
    const user = await prisma.user.create({
      data: {
        tenantId,
        fullName: "M5 Admin",
        email: `${runId}-admin@test.local`,
        passwordHash: "x",
        role: "TENANT_ADMIN",
        status: "ACTIVE",
      },
    });
    userId = user.id;
    const contact = await prisma.contact.create({
      data: { tenantId, fullName: "Aziz Aliyev", phones: ["+998901112233"] },
    });
    contactId = contact.id;
    const pipeline = await prisma.pipeline.create({
      data: { tenantId, name: "Sotuv", isDefault: true, order: 0 },
    });
    pipelineId = pipeline.id;
    const stage = await prisma.stage.create({
      data: {
        tenantId,
        pipelineId,
        name: "Yangi",
        order: 0,
        color: "#0ea5e9",
        type: "NORMAL",
      },
    });
    stageId = stage.id;
  });

  afterAll(async () => {
    await prisma.smsLog.deleteMany({ where: { tenantId } });
    await prisma.smsTemplate.deleteMany({ where: { tenantId } });
    await prisma.task.deleteMany({ where: { tenantId } });
    await prisma.card.deleteMany({ where: { tenantId } });
    await prisma.contact.deleteMany({ where: { tenantId } });
    await prisma.trigger.deleteMany({ where: { tenantId } });
    await prisma.stage.deleteMany({ where: { tenantId } });
    await prisma.pipeline.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
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

  it("interpolate replaces {ism} {sana} {summa} and leaves unknown keys untouched", () => {
    const out = interpolate("Salom {ism}, {sana} kuni {summa} so'm. {unknown}", {
      ism: "Aziz",
      sana: "2026-05-27",
      summa: 150000,
    });
    expect(out).toBe("Salom Aziz, 2026-05-27 kuni 150000 so'm. {unknown}");
  });

  it("MockSmsAdapter returns SENT and stores message", async () => {
    const res = await mock.send({ phone: "+998901112233", text: "Hello" });
    expect(res.status).toBe(SmsStatus.SENT);
    expect(res.providerMessageId).toMatch(/^mock-/);
    expect(mock.sent).toHaveLength(1);
  });

  it("manual send writes SmsLog, interpolates variables, uses mock provider", async () => {
    const template = await asTenant(() =>
      sms.createTemplate({
        name: `welcome-${runId}`,
        body: "Salom {ism}, sizning summangiz {summa} so'm",
      }),
    );
    const log = await asTenant(() =>
      sms.sendManual({
        phone: "+998901112233",
        templateId: template.id,
        variables: { ism: "Aziz", summa: 99000 },
        contactId,
      }),
    );
    expect(log.status).toBe(SmsStatus.SENT);
    expect(log.text).toBe("Salom Aziz, sizning summangiz 99000 so'm");
    expect(log.provider).toBe("mock");
    expect(mock.sent).toHaveLength(1);
  });

  it("rate-limiter blocks the 4th send to the same phone within the window", async () => {
    for (let i = 0; i < 3; i += 1) {
      await asTenant(() =>
        sms.sendManual({ phone: "+998901112299", text: `msg ${i}`, contactId }),
      );
    }
    await expect(
      asTenant(() =>
        sms.sendManual({ phone: "+998901112299", text: "msg 4", contactId }),
      ),
    ).rejects.toBeInstanceOf(TooManyRequestsException);
  });

  it("delivery webhook updates SmsLog status from SENT → DELIVERED", async () => {
    const log = await asTenant(() =>
      sms.sendManual({ phone: "+998901119999", text: "Webhook test", contactId }),
    );
    expect(log.providerMessageId).not.toBeNull();
    const updated = await sms.handleWebhook(tenantId, "mock", {
      message_id: log.providerMessageId!,
      status: "DELIVERED",
    });
    expect(updated.status).toBe(SmsStatus.DELIVERED);
    expect(updated.deliveredAt).not.toBeNull();
  });

  it("trigger 'sms' action fires when a card is moved to a configured stage", async () => {
    // Configure a trigger: when card moves to stageId, send SMS to the contact.
    const trigger = await asTenant(() =>
      triggers.create({
        name: `sms-on-stage-${runId}`,
        event: { type: "card.moved", stageId },
        conditions: {},
        actions: [{ type: "sms", text: "Salom {ism}, bosqich o'zgardi" }],
      }),
    );
    expect(trigger.isActive).toBe(true);

    // Create a card, then move it to stageId — but it's already there.
    // Create a second stage to move FROM, then move TO stageId.
    const sFrom = await prisma.stage.create({
      data: {
        tenantId,
        pipelineId,
        name: "From",
        order: 1,
        color: "#999",
        type: "NORMAL",
      },
    });
    const card = await asTenant(() =>
      cards.create({
        title: "Trigger card",
        contactId,
        pipelineId,
        stageId: sFrom.id,
      }),
    );
    mock.reset();
    await asTenant(() => cards.move(card.id, { stageId }));

    // EventEmitter2's emit() returns immediately — listener Promises run as
    // fire-and-forget. Poll for the side-effect rather than guessing how
    // many ticks the chain (trigger lookup → SMS insert → adapter) takes.
    const deadline = Date.now() + 2000;
    while (mock.sent.length === 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 25));
    }

    expect(mock.sent.length).toBeGreaterThanOrEqual(1);
    const last = mock.sent[mock.sent.length - 1];
    expect(last.phone).toBe("+998901112233");
    expect(last.text).toContain("Aziz Aliyev");
    expect(last.text).toContain("bosqich o'zgardi");

    // Cleanup
    await prisma.smsLog.deleteMany({ where: { cardId: card.id } });
    await prisma.stage.delete({ where: { id: sFrom.id } });
  });

  // Eskiz only accepts pre-approved templates; arbitrary text → API rejects.
  // Mirror that with a server-side guard so tenants don't waste a send.
  it("rejects free-text send when tenant has allowFreeText=false", async () => {
    // Flip the tenant's flag (test isolation: restore after).
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { smsConfig: { provider: "mock", allowFreeText: false } },
    });
    try {
      await expect(
        asTenant(() =>
          sms.sendManual({ phone: "+998901112255", text: "free", contactId }),
        ),
      ).rejects.toThrow(/Erkin matn o'chirilgan/);
    } finally {
      await prisma.tenant.update({
        where: { id: tenantId },
        data: { smsConfig: { provider: "mock", allowFreeText: true } },
      });
    }
  });

  // Template send still works regardless of the free-text flag — the rule
  // exists to push operators toward approved templates, not to block them.
  it("template send works even when allowFreeText=false", async () => {
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { smsConfig: { provider: "mock", allowFreeText: false } },
    });
    try {
      const template = await asTenant(() =>
        sms.createTemplate({
          name: `approved-${runId}`,
          body: "Salom {ism}, tasdiqlandi",
        }),
      );
      const log = await asTenant(() =>
        sms.sendManual({
          phone: "+998901112266",
          templateId: template.id,
          variables: { ism: "Aziz" },
          contactId,
        }),
      );
      expect(log.status).toBe(SmsStatus.SENT);
      expect(log.text).toBe("Salom Aziz, tasdiqlandi");
    } finally {
      await prisma.tenant.update({
        where: { id: tenantId },
        data: { smsConfig: { provider: "mock", allowFreeText: true } },
      });
    }
  });

  // Eskiz returns the template list at data.result on newer accounts and at
  // data[] on older ones; parser tolerates both and surfaces externalStatus.
  it("EskizSmsAdapter.fetchTemplates parses both data[] and data.result shapes", async () => {
    const cacheSvc = new EskizTokenCacheService(prisma);
    // Seed a fresh token so fetchTemplates doesn't try to log in here.
    await cacheSvc.write(tenantId, "JWT-PARSER", new Date(Date.now() + 60_000));
    const eskiz = new EskizSmsAdapter(cacheSvc);

    const shapes = [
      {
        data: [
          { id: 1, template: "Salom {ism}", status: "service" },
          { id: 2, original_text: "Boshqa", status: "moderation" },
        ],
      },
      {
        data: {
          result: [
            { id: 30, text: "Salom {ism}, {sana}", status: "service" },
          ],
        },
      },
    ];
    for (const shape of shapes) {
      const fetchSpy = jest
        .spyOn(global, "fetch")
        .mockResolvedValue(new Response(JSON.stringify(shape), { status: 200 }));
      try {
        const out = await eskiz.fetchTemplates({ email: "x", password: "y" }, { tenantId });
        expect(out.length).toBeGreaterThan(0);
        expect(out[0].externalId).toBeTruthy();
        expect(out[0].body).toBeTruthy();
      } finally {
        fetchSpy.mockRestore();
      }
    }

    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          result: [
            {
              id: 44,
              template: "Filial haqida ma'lumot",
              original_text: "Filial haqida ma'lumot: https://example.uz/location",
              status: "service",
            },
          ],
        }),
        { status: 200 },
      ),
    );
    try {
      const out = await eskiz.fetchTemplates({ email: "x", password: "y" }, { tenantId });
      expect(out[0].body).toBe("Filial haqida ma'lumot: https://example.uz/location");
    } finally {
      fetchSpy.mockRestore();
    }
    // Cleanup the seeded JWT row so later tests start clean.
    await prisma.eskizTokenCache.deleteMany({ where: { tenantId } });
  });

  // syncTemplatesFromProvider stores fetched templates as SmsTemplate rows.
  // Re-running upserts in place rather than creating duplicates.
  it("syncTemplatesFromProvider upserts templates idempotently", async () => {
    // Configure Eskiz integration for this tenant. The adapter still needs
    // email + password to log in for the JWT; we mock the HTTP below.
    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        smsConfig: {
          provider: "eskiz",
          allowFreeText: false,
          email: "test@test.uz",
          password: "x",
        },
      },
    });
    const fetched = [
      { id: 100, template: "Salom {ism}, tasdiqlandi", status: "service" },
      { id: 101, template: "Mijoz {ism}, javob bering", status: "moderation" },
    ];
    // The adapter calls /auth/login first to get a JWT, then /user/templates.
    // Return the appropriate body for each path so the same mock covers both
    // the initial login and the subsequent template fetch.
    const fetchSpy = jest
      .spyOn(global, "fetch")
      .mockImplementation(async (url: RequestInfo | URL) => {
        if (String(url).endsWith("/auth/login")) {
          return new Response(JSON.stringify({ data: { token: "JWT-SYNC" } }), { status: 200 });
        }
        return new Response(JSON.stringify({ data: fetched }), { status: 200 });
      });
    try {
      const r1 = await asTenant(() => sms.syncTemplatesFromProvider());
      expect(r1.fetched).toBe(2);
      expect(r1.upserted).toBe(2);

      // Run twice; nothing duplicates.
      const r2 = await asTenant(() => sms.syncTemplatesFromProvider());
      expect(r2.upserted).toBe(2);

      const rows = await prisma.smsTemplate.findMany({
        where: { tenantId, externalProvider: "eskiz" },
      });
      expect(rows).toHaveLength(2);
      expect(rows.find((r) => r.externalId === "100")?.externalStatus).toBe("service");
    } finally {
      fetchSpy.mockRestore();
      await prisma.smsTemplate.deleteMany({
        where: { tenantId, externalProvider: "eskiz" },
      });
      await prisma.eskizTokenCache.deleteMany({ where: { tenantId } });
      await prisma.tenant.update({
        where: { id: tenantId },
        data: { smsConfig: { provider: "mock", allowFreeText: true } },
      });
    }
  });
});
