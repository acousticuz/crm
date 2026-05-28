import "reflect-metadata";
import { Test, TestingModule } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { ClsModule, ClsService } from "nestjs-cls";
import { CallDirection, CallStatus, UserRole } from "@acoustic-crm/shared";
import { PrismaService } from "../src/modules/prisma/prisma.service";
import { RealtimeService } from "../src/modules/realtime/realtime.service";
import { AuditService } from "../src/modules/audit/audit.service";
import { IntegrationsService } from "../src/modules/integrations/integrations.service";
import { CallsService } from "../src/modules/calls/calls.service";
import { MockAmiClient } from "../../telephony-worker/src/ami/mock.ami";
import { writeContext } from "../src/common/tenant-context";

describe("M6 — Calls (AMI mock + inbound + MISSED + tenant isolation)", () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let cls: ClsService;
  let calls: CallsService;
  let ami: MockAmiClient;

  let tenantId: string;
  let otherTenantId: string;
  let userId: string;
  let contactId: string;
  let cardId: string;

  const runId = `m6-${Date.now()}`;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        ClsModule.forRoot({ global: true }),
        EventEmitterModule.forRoot({ wildcard: true }),
      ],
      providers: [PrismaService, RealtimeService, AuditService, IntegrationsService, CallsService],
    }).compile();
    await moduleRef.init();

    cls = moduleRef.get(ClsService);
    prisma = moduleRef.get(PrismaService);
    calls = moduleRef.get(CallsService);
    ami = new MockAmiClient();
    await prisma.$connect();

    const t1 = await prisma.tenant.create({
      data: { name: `${runId}-t1`, status: "ACTIVE" },
    });
    tenantId = t1.id;
    const t2 = await prisma.tenant.create({
      data: { name: `${runId}-t2`, status: "ACTIVE" },
    });
    otherTenantId = t2.id;
    const user = await prisma.user.create({
      data: {
        tenantId,
        fullName: "Operator One",
        email: `${runId}-op1@test.local`,
        passwordHash: "x",
        role: "TENANT_ADMIN",
        status: "ACTIVE",
      },
    });
    userId = user.id;
    const c = await prisma.contact.create({
      data: { tenantId, fullName: "Bekzod L", phones: ["+998901112233"] },
    });
    contactId = c.id;
    const pipeline = await prisma.pipeline.create({
      data: { tenantId, name: "Default", isDefault: true, order: 0 },
    });
    const stage = await prisma.stage.create({
      data: { tenantId, pipelineId: pipeline.id, name: "Yangi", order: 0, color: "#0ea5e9", type: "NORMAL" },
    });
    const card = await prisma.card.create({
      data: {
        tenantId,
        pipelineId: pipeline.id,
        stageId: stage.id,
        contactId,
        title: "M6 card",
        responsibleUserId: userId,
      },
    });
    cardId = card.id;
  });

  afterAll(async () => {
    await prisma.task.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
    await prisma.call.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
    await prisma.card.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
    await prisma.stage.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
    await prisma.pipeline.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
    await prisma.contact.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
    await prisma.user.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantId, otherTenantId] } } });
    await prisma.$disconnect();
    await moduleRef.close();
  });

  function asTenant<T>(tid: string, fn: () => Promise<T>): Promise<T> {
    return cls.run(async () => {
      writeContext(cls, {
        tenantId: tid,
        userId,
        role: UserRole.TENANT_ADMIN,
        email: "op@test.local",
        skipTenantFilter: false,
      });
      return fn();
    });
  }

  it("MockAmiClient simulateInbound drives the worker → backend pipeline", async () => {
    // Manually wire what the Coordinator does in apps/telephony-worker.
    ami.onIncoming(async (e) => {
      await asTenant(tenantId, () =>
        calls.incoming({
          tenantId: e.tenantId,
          cdrUniqueId: e.cdrUniqueId,
          fromNumber: e.fromNumber,
          toNumber: e.toNumber,
          operatorId: e.operatorId,
        }),
      );
    });
    ami.onCompleted(async (e) => {
      await asTenant(tenantId, () =>
        calls.completed({
          tenantId: e.tenantId,
          cdrUniqueId: e.cdrUniqueId,
          direction: e.direction as CallDirection,
          fromNumber: e.fromNumber,
          toNumber: e.toNumber,
          operatorId: e.operatorId,
          status: e.status as CallStatus,
          startedAt: e.startedAt,
          duration: e.duration,
          recordingUrl: e.recordingUrl,
        }),
      );
    });

    const cdrId = await ami.simulateInbound({
      tenantId,
      fromNumber: "+998901112233",
      operatorId: userId,
    });

    const call = await asTenant(tenantId, () =>
      prisma.t.call.findFirst({ where: { cdrUniqueId: cdrId } }),
    );
    expect(call).not.toBeNull();
    expect(call!.direction).toBe("INBOUND");
    expect(call!.status).toBe("ANSWERED");
    expect(call!.contactId).toBe(contactId);
    expect(call!.cardId).toBe(cardId);
    expect(call!.recordingUrl).toMatch(/^mock:\/\//);
    expect(call!.duration).toBeGreaterThan(0);
  });

  it("MISSED inbound auto-creates a callback Task assigned to the operator", async () => {
    const cdrId = await ami.simulateMissed({
      tenantId,
      fromNumber: "+998901112233",
      operatorId: userId,
    });

    const call = await asTenant(tenantId, () =>
      prisma.t.call.findFirst({ where: { cdrUniqueId: cdrId } }),
    );
    expect(call!.status).toBe("MISSED");

    const task = await asTenant(tenantId, () =>
      prisma.t.task.findFirst({
        where: { contactId, type: "CALL", text: { contains: "qayta qo'ng'iroq" } },
        orderBy: { createdAt: "desc" },
      }),
    );
    expect(task).not.toBeNull();
    expect(task!.assigneeId).toBe(userId);
    expect(task!.cardId).toBe(cardId);
  });

  it("incoming() from an unknown number auto-creates a 'Noma'lum' contact (CALL_FIXES)", async () => {
    const result = await asTenant(tenantId, () =>
      calls.incoming({
        tenantId,
        cdrUniqueId: `unknown-${Date.now()}`,
        fromNumber: "+998999999999",
        toNumber: "+998000000000",
      }),
    );
    // New behavior: unknown inbound numbers are never lost — a "Noma'lum"
    // contact is created and linked.
    expect(result.matched).toBe(true);
    expect(result.contactId).not.toBeNull();
    const c = await asTenant(tenantId, () =>
      prisma.t.contact.findFirst({ where: { id: result.contactId! } }),
    );
    expect(c?.fullName).toBe("Noma'lum");
  });

  it("tenant isolation: completed() in tenant A does not leak Call rows into tenant B", async () => {
    const cdrId = `iso-${Date.now()}`;
    await asTenant(tenantId, () =>
      calls.completed({
        tenantId,
        cdrUniqueId: cdrId,
        direction: CallDirection.INBOUND,
        fromNumber: "+998901112233",
        toNumber: "+998000000000",
        status: CallStatus.ANSWERED,
        startedAt: new Date().toISOString(),
        duration: 60,
        recordingUrl: "mock://r.wav",
      }),
    );
    const seenInA = await asTenant(tenantId, () =>
      prisma.t.call.findFirst({ where: { cdrUniqueId: cdrId } }),
    );
    const seenInB = await asTenant(otherTenantId, () =>
      prisma.t.call.findFirst({ where: { cdrUniqueId: cdrId } }),
    );
    expect(seenInA).not.toBeNull();
    expect(seenInB).toBeNull();
  });

  it("upserts by (tenantId, cdrUniqueId) — same id twice does not create duplicates", async () => {
    const cdrId = `dup-${Date.now()}`;
    const args = {
      tenantId,
      cdrUniqueId: cdrId,
      direction: CallDirection.INBOUND,
      fromNumber: "+998901112233",
      toNumber: "+998000000000",
      status: CallStatus.ANSWERED,
      startedAt: new Date().toISOString(),
      duration: 30,
    };
    await asTenant(tenantId, () => calls.completed(args));
    await asTenant(tenantId, () =>
      calls.completed({ ...args, status: CallStatus.FAILED, duration: 31 }),
    );
    const rows = await asTenant(tenantId, () =>
      prisma.t.call.findMany({ where: { cdrUniqueId: cdrId } }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("FAILED");
    expect(rows[0].duration).toBe(31);
  });

  it("click-to-call originates with the operator's PJSIP extension, not their user id", async () => {
    // Operator is mapped to a real PBX extension.
    await prisma.user.update({ where: { id: userId }, data: { extension: "101" } });

    const captured: { body?: Record<string, unknown> } = {};
    const fetchSpy = jest
      .spyOn(global, "fetch")
      .mockImplementation(async (_url: RequestInfo | URL, init?: RequestInit) => {
        captured.body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(JSON.stringify({ queued: true }), { status: 202 });
      });

    try {
      const res = await asTenant(tenantId, () =>
        calls.originate({ toNumber: "+998901112233", cardId }),
      );
      expect(res.queued).toBe(true);
      // The worker builds PJSIP/{fromExtension}; it must be the extension.
      expect(captured.body?.fromExtension).toBe("101");
      expect(captured.body?.fromExtension).not.toBe(userId);
      // operatorId still carries the CRM user id for correlation.
      expect(captured.body?.operatorId).toBe(userId);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("lists PBX extensions by proxying to the worker for the current tenant", async () => {
    const captured: { url?: string } = {};
    const fetchSpy = jest
      .spyOn(global, "fetch")
      .mockImplementation(async (url: RequestInfo | URL) => {
        captured.url = String(url);
        return new Response(JSON.stringify({ extensions: ["2000", "2001", "2002"] }), {
          status: 200,
        });
      });
    try {
      const exts = await asTenant(tenantId, () => calls.listPbxExtensions());
      expect(exts).toEqual(["2000", "2001", "2002"]);
      expect(captured.url).toContain("/worker/extensions");
      expect(captured.url).toContain(`tenantId=${tenantId}`);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("returns an empty extension list when the worker is unreachable", async () => {
    const fetchSpy = jest.spyOn(global, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));
    try {
      const exts = await asTenant(tenantId, () => calls.listPbxExtensions());
      expect(exts).toEqual([]);
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
