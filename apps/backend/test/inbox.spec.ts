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
});
