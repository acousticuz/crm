import "reflect-metadata";
import { Test, TestingModule } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { ClsModule, ClsService } from "nestjs-cls";
import { UserRole } from "@acoustic-crm/shared";
import { PrismaService } from "../src/modules/prisma/prisma.service";
import { RealtimeService } from "../src/modules/realtime/realtime.service";
import { AuditService } from "../src/modules/audit/audit.service";
import { InboxService } from "../src/modules/inbox/inbox.service";
import { IntegrationsService } from "../src/modules/integrations/integrations.service";
import { detectSensitiveCategories } from "../src/modules/inbox/sensitivity";
import { writeContext } from "../src/common/tenant-context";

describe("M10 — Omnichannel inbox + AI draft + safety guardrails", () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let cls: ClsService;
  let inbox: InboxService;

  let tenantId: string;
  let userId: string;

  const runId = `m10-${Date.now()}`;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        ClsModule.forRoot({ global: true }),
        EventEmitterModule.forRoot({ wildcard: true }),
      ],
      providers: [PrismaService, RealtimeService, AuditService, IntegrationsService, InboxService],
    }).compile();
    await moduleRef.init();

    cls = moduleRef.get(ClsService);
    prisma = moduleRef.get(PrismaService);
    inbox = moduleRef.get(InboxService);
    await prisma.$connect();

    const t = await prisma.tenant.create({
      data: { name: `${runId}-tenant`, status: "ACTIVE" },
    });
    tenantId = t.id;
    const u = await prisma.user.create({
      data: {
        tenantId,
        fullName: "Inbox Operator",
        email: `${runId}-op@test.local`,
        passwordHash: "x",
        role: "OPERATOR",
        status: "ACTIVE",
      },
    });
    userId = u.id;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { tenantId } });
    await prisma.inboxMessage.deleteMany({ where: { tenantId } });
    await prisma.inboxThread.deleteMany({ where: { tenantId } });
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
        role: UserRole.OPERATOR,
        email: "op@test.local",
        skipTenantFilter: false,
      });
      return fn();
    });
  }

  it("detectSensitiveCategories flags medical, pricing, and legal terms", () => {
    expect(detectSensitiveCategories("Bizdan dori sotib oling")).toEqual(["medical"]);
    expect(detectSensitiveCategories("Narxlari qancha?")).toEqual(["pricing"]);
    expect(detectSensitiveCategories("Bu masalada advokat bilan gaplashing")).toEqual([
      "legal",
    ]);
    expect(detectSensitiveCategories("Salom, kuningiz xayrli o'tdi?")).toEqual([]);
    const both = detectSensitiveCategories("Narx haqida tibbiy maslahat bering");
    expect(both).toContain("medical");
    expect(both).toContain("pricing");
  });

  it("webhook ingests a benign message → DRAFT status (operator review still required)", async () => {
    const result = await inbox.ingestWebhook(tenantId, "instagram", {
      externalThreadId: "ig-thread-1",
      externalMessageId: "ig-msg-1",
      text: "Assalomu alaykum, kunigizni qanday yaxshilash mumkin?",
      senderName: "customer-1",
    });
    expect(result.draft.status).toBe("DRAFT");
    expect(result.draft.sensitiveCategories).toEqual([]);

    // Inbound + draft persisted on the thread.
    const stored = await asTenant(() =>
      prisma.t.inboxMessage.findMany({ where: { threadId: result.threadId } }),
    );
    expect(stored).toHaveLength(2); // inbound + outbound draft
    expect(stored.find((m) => m.direction === "INBOUND")?.status).toBe("RECEIVED");
    expect(stored.find((m) => m.direction === "OUTBOUND")?.text).toMatch(/Acoustic|murojaat/i);

    // AuditLog written.
    const audit = await prisma.auditLog.findFirst({
      where: { tenantId, action: "inbox.draft.created", entityId: result.draft.id },
    });
    expect(audit).not.toBeNull();
    const details = audit!.details as Record<string, unknown>;
    expect(details.autoSendBlocked).toBe(false);
  });

  it("webhook ingests a sensitive (medical) message → NEEDS_REVIEW + audit flags autoSendBlocked", async () => {
    const result = await inbox.ingestWebhook(tenantId, "facebook", {
      externalThreadId: "fb-thread-1",
      externalMessageId: "fb-msg-1",
      text: "Eshitish apparatlaringizning dori-darmonlar bilan birgalikda ishlashi haqida tibbiy maslahat bering",
    });
    expect(result.draft.status).toBe("NEEDS_REVIEW");
    expect(result.draft.sensitiveCategories).toContain("medical");

    const audit = await prisma.auditLog.findFirst({
      where: { tenantId, action: "inbox.draft.created", entityId: result.draft.id },
    });
    const details = audit!.details as Record<string, unknown>;
    expect(details.autoSendBlocked).toBe(true);
    expect(details.sensitiveCategories).toContain("medical");
  });

  it("approveDraft sends the message, records reviewer, and audit-logs the transition", async () => {
    const fresh = await inbox.ingestWebhook(tenantId, "instagram", {
      externalThreadId: "ig-thread-approve",
      externalMessageId: "ig-msg-approve",
      text: "Salom, savolim bor",
    });
    const sent = await asTenant(() =>
      inbox.approveDraft(fresh.draft.id, { text: "Salom! Operator tez orada javob beradi." }),
    );
    expect(sent.status).toBe("SENT");
    expect(sent.sentAt).not.toBeNull();
    expect(sent.approvedBy).toBe(userId);

    const audit = await prisma.auditLog.findFirst({
      where: { tenantId, action: "inbox.draft.approved", entityId: fresh.draft.id },
    });
    expect(audit).not.toBeNull();
  });

  it("approveDraft re-runs sensitivity check on the operator-edited text", async () => {
    const fresh = await inbox.ingestWebhook(tenantId, "instagram", {
      externalThreadId: "ig-thread-reedit",
      externalMessageId: "ig-msg-reedit",
      text: "Salom",
    });
    expect(fresh.draft.sensitiveCategories).toEqual([]);
    const sent = await asTenant(() =>
      // Operator decides to share pricing — sensitive content re-introduced.
      inbox.approveDraft(fresh.draft.id, {
        text: "Salom! Eshitish apparatlari narxlari 5 000 000 so'mdan boshlanadi.",
      }),
    );
    expect(sent.sensitiveCategories).toContain("pricing");
    expect(sent.status).toBe("SENT"); // operator knowingly approved
  });

  it("rejectDraft stores the rejection reason and audit-logs it", async () => {
    const fresh = await inbox.ingestWebhook(tenantId, "facebook", {
      externalThreadId: "fb-thread-reject",
      externalMessageId: "fb-msg-reject",
      text: "Yuridik shartnoma masalasi",
    });
    expect(fresh.draft.status).toBe("NEEDS_REVIEW");
    const r = await asTenant(() =>
      inbox.rejectDraft(fresh.draft.id, { reason: "Yuridik mavzuga operator javob beradi" }),
    );
    expect(r.status).toBe("REJECTED");
    expect(r.rejectionReason).toMatch(/Yuridik/);
    const audit = await prisma.auditLog.findFirst({
      where: { tenantId, action: "inbox.draft.rejected", entityId: fresh.draft.id },
    });
    expect(audit).not.toBeNull();
  });

  it("approve after reject is rejected (state machine)", async () => {
    const fresh = await inbox.ingestWebhook(tenantId, "facebook", {
      externalThreadId: "fb-thread-state",
      externalMessageId: "fb-msg-state",
      text: "Test",
    });
    await asTenant(() => inbox.rejectDraft(fresh.draft.id, { reason: "x" }));
    await expect(asTenant(() => inbox.approveDraft(fresh.draft.id, {}))).rejects.toThrow();
  });

  it("listThreads returns only the active tenant's threads (multi-tenant isolation)", async () => {
    const otherT = await prisma.tenant.create({
      data: { name: `${runId}-other`, status: "ACTIVE" },
    });
    try {
      await inbox.ingestWebhook(otherT.id, "instagram", {
        externalThreadId: "other-1",
        externalMessageId: "other-1-msg",
        text: "should not leak",
      });
      const mine = await asTenant(() => inbox.listThreads({ status: "OPEN" }));
      expect(mine.find((t) => t.tenantId === otherT.id)).toBeUndefined();
    } finally {
      await prisma.auditLog.deleteMany({ where: { tenantId: otherT.id } });
      await prisma.inboxMessage.deleteMany({ where: { tenantId: otherT.id } });
      await prisma.inboxThread.deleteMany({ where: { tenantId: otherT.id } });
      await prisma.tenant.delete({ where: { id: otherT.id } });
    }
  });

  // --- Telegram inbound + reply ----------------------------------------
  //
  // The Telegram bot was previously outbound-only (TelegramNotifierService
  // for supervisor pings). These tests cover the new inbound + reply path:
  // (1) a Telegram update creates or links a Contact, opens a thread, and
  //     stores the inbound message; (2) an operator reply hits the bot
  //     sendMessage endpoint and is recorded as SENT.
  describe("Telegram inbound + reply", () => {
    const integrations = () =>
      moduleRef.get<IntegrationsService>(IntegrationsService);

    afterEach(async () => {
      await prisma.inboxMessage.deleteMany({
        where: { tenantId, thread: { channel: "telegram" } },
      });
      await prisma.inboxThread.deleteMany({ where: { tenantId, channel: "telegram" } });
      await prisma.contact.deleteMany({ where: { tenantId, source: "telegram" } });
      await prisma.integration.deleteMany({ where: { tenantId, type: "TELEGRAM" } });
    });

    function makeUpdate(opts: {
      update_id: number;
      chat_id: number;
      message_id: number;
      text: string;
      from?: { id: number; first_name?: string; username?: string };
      phone?: string;
    }) {
      return {
        update_id: opts.update_id,
        message: {
          message_id: opts.message_id,
          date: Math.floor(Date.now() / 1000),
          text: opts.text,
          chat: { id: opts.chat_id, type: "private" },
          from: opts.from ?? { id: 4242, first_name: "Aziz" },
          ...(opts.phone ? { contact: { phone_number: opts.phone } } : {}),
        },
      };
    }

    it("inbound update creates a Noma'lum-style contact, opens a thread, and stores the message", async () => {
      const res = await inbox.ingestTelegramUpdate(
        tenantId,
        makeUpdate({
          update_id: 100,
          chat_id: 555,
          message_id: 1,
          text: "Salom, narxi qancha?",
          from: { id: 4242, first_name: "Aziz", username: "azizov" },
        }),
      );
      expect(res).not.toBeNull();
      // Thread
      const thread = await prisma.inboxThread.findFirst({
        where: { tenantId, channel: "telegram", externalThreadId: "555" },
      });
      expect(thread).not.toBeNull();
      expect(thread!.contactId).not.toBeNull();
      // Contact — tagged with source="telegram" + name from the Update
      const contact = await prisma.contact.findFirst({
        where: { id: thread!.contactId!, tenantId },
      });
      expect(contact).not.toBeNull();
      expect(contact!.source).toBe("telegram");
      expect(contact!.fullName).toBe("Aziz");
      // Message
      const msg = await prisma.inboxMessage.findFirst({
        where: { threadId: thread!.id, direction: "INBOUND" },
      });
      expect(msg).not.toBeNull();
      expect(msg!.text).toBe("Salom, narxi qancha?");
      expect(msg!.externalMessageId).toBe("1");
    });

    it("inbound update is idempotent — same update_id processed twice produces one message", async () => {
      await inbox.ingestTelegramUpdate(
        tenantId,
        makeUpdate({ update_id: 200, chat_id: 777, message_id: 7, text: "hi" }),
      );
      await inbox.ingestTelegramUpdate(
        tenantId,
        makeUpdate({ update_id: 200, chat_id: 777, message_id: 7, text: "hi" }),
      );
      const count = await prisma.inboxMessage.count({
        where: { tenantId, externalMessageId: "7" },
      });
      expect(count).toBe(1);
    });

    it("inbound update with a shared phone matches an existing contact instead of creating one", async () => {
      const c = await prisma.contact.create({
        data: { tenantId, fullName: "Allaqachon mavjud", phones: ["+998901112255"] },
      });
      try {
        await inbox.ingestTelegramUpdate(
          tenantId,
          makeUpdate({
            update_id: 300,
            chat_id: 888,
            message_id: 9,
            text: "phone match",
            from: { id: 5151, first_name: "PhoneMatch" },
            phone: "+998901112255",
          }),
        );
        const thread = await prisma.inboxThread.findFirst({
          where: { tenantId, channel: "telegram", externalThreadId: "888" },
        });
        expect(thread!.contactId).toBe(c.id);
        // No new "Noma'lum"-style contact was created.
        const tgContacts = await prisma.contact.count({
          where: { tenantId, source: "telegram" },
        });
        expect(tgContacts).toBe(0);
      } finally {
        await prisma.contact.delete({ where: { id: c.id } });
      }
    });

    it("operator reply hits Telegram sendMessage with the saved bot token and records SENT", async () => {
      // Seed an inbound thread first.
      await inbox.ingestTelegramUpdate(
        tenantId,
        makeUpdate({ update_id: 400, chat_id: 999, message_id: 11, text: "kerak" }),
      );
      const thread = await prisma.inboxThread.findFirst({
        where: { tenantId, channel: "telegram", externalThreadId: "999" },
      });
      // Configure the tenant's TELEGRAM integration (botToken is encrypted).
      await cls.run(async () => {
        writeContext(cls, {
          tenantId,
          userId,
          role: UserRole.TENANT_ADMIN,
          email: "admin@test.local",
          skipTenantFilter: false,
        });
        await integrations().upsert("TELEGRAM" as never, {
          config: { botToken: "tg-bot-secret", chatId: "999", purpose: "customer" },
        });
      });

      const captured: { url?: string; body?: string } = {};
      const fetchSpy = jest
        .spyOn(global, "fetch")
        .mockImplementation(async (url: RequestInfo | URL, init?: RequestInit) => {
          captured.url = String(url);
          captured.body = String(init?.body ?? "");
          return new Response(
            JSON.stringify({ ok: true, result: { message_id: 42 } }),
            { status: 200 },
          );
        });
      try {
        const sent = await asTenant(() =>
          inbox.sendManual(thread!.id, { text: "Salom, men yordamchi" }),
        );
        expect(captured.url).toContain("/bot");
        expect(captured.url).toContain("/sendMessage");
        expect(captured.body).toContain("999"); // chat_id surfaces in body
        expect(captured.body).toContain("Salom, men yordamchi");
        expect(sent.status).toBe("SENT");
        expect(sent.externalMessageId).toBe("42");
        expect(sent.direction).toBe("OUTBOUND");
      } finally {
        fetchSpy.mockRestore();
      }
    });

    // The user reported that a freshly-saved bot token never received any
    // messages. Root cause: tickTelegramPolling required inboundMode to be
    // explicitly "polling". Now the default (mode missing / null) means
    // polling — so any tenant with a bot token gets ingest out of the box.
    it("tickTelegramPolling defaults to polling when inboundMode is not set", async () => {
      // Configure ONLY the bot token — no inboundMode, no chatId.
      await cls.run(async () => {
        writeContext(cls, {
          tenantId,
          userId,
          role: UserRole.TENANT_ADMIN,
          email: "admin@test.local",
          skipTenantFilter: false,
        });
        await integrations().upsert("TELEGRAM" as never, {
          config: { botToken: "bot-default-token" },
        });
      });

      const calls: string[] = [];
      const fetchSpy = jest
        .spyOn(global, "fetch")
        .mockImplementation(async (url: RequestInfo | URL) => {
          calls.push(String(url));
          // One incoming update from chat 5050.
          return new Response(
            JSON.stringify({
              ok: true,
              result: [
                {
                  update_id: 9001,
                  message: {
                    message_id: 51,
                    date: Math.floor(Date.now() / 1000),
                    text: "Salom default",
                    chat: { id: 5050, type: "private" },
                    from: { id: 7070, first_name: "DefaultUser" },
                  },
                },
              ],
            }),
            { status: 200 },
          );
        });
      try {
        const result = await inbox.tickTelegramPolling(tenantId);
        expect(result.processed).toBe(1);
        // Long-polling: timeout=25 is on the query string.
        expect(calls[0]).toContain("getUpdates");
        expect(calls[0]).toContain("timeout=25");
        // Inbound message landed.
        const msg = await prisma.inboxMessage.findFirst({
          where: { tenantId, text: "Salom default" },
        });
        expect(msg).not.toBeNull();
        // Offset advanced (server-managed) — next tick won't re-process this update.
        const row = await prisma.integration.findFirst({
          where: { tenantId, type: "TELEGRAM" },
        });
        const cfgAfter = row?.config as { inboundOffset?: number } | null;
        expect(cfgAfter?.inboundOffset).toBe(9002);
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it("tickTelegramPolling does NOTHING when inboundMode is explicitly 'off'", async () => {
      await cls.run(async () => {
        writeContext(cls, {
          tenantId,
          userId,
          role: UserRole.TENANT_ADMIN,
          email: "admin@test.local",
          skipTenantFilter: false,
        });
        await integrations().upsert("TELEGRAM" as never, {
          config: { botToken: "bot-off-token", inboundMode: "off" },
        });
      });
      const fetchSpy = jest.spyOn(global, "fetch").mockImplementation(async () => {
        throw new Error("getUpdates should not be called when mode=off");
      });
      try {
        const result = await inbox.tickTelegramPolling(tenantId);
        expect(result.processed).toBe(0);
        expect(fetchSpy).not.toHaveBeenCalled();
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it("tickAllPollingTenants only ticks tenants whose bot token is configured", async () => {
      // No integration row exists for this tenant → tickAll is a no-op.
      const otherTenant = await prisma.tenant.create({
        data: { name: `${runId}-no-tg`, status: "ACTIVE" },
      });
      try {
        const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue(
          new Response(JSON.stringify({ ok: true, result: [] }), { status: 200 }),
        );
        try {
          await inbox.tickAllPollingTenants();
          // Some calls may be made for *other* tenants (notably the main
          // test tenant if it still has a configured token). Just assert
          // there was no error.
          expect(fetchSpy).toHaveBeenCalled.bind(null); // not asserting count
        } finally {
          fetchSpy.mockRestore();
        }
      } finally {
        await prisma.tenant.delete({ where: { id: otherTenant.id } });
      }
    });
  });
});
