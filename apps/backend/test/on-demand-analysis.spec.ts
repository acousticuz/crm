import "reflect-metadata";
import { Test, TestingModule } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { ClsModule, ClsService } from "nestjs-cls";
import {
  CallDirection,
  CallStatus,
  UserRole,
} from "@acoustic-crm/shared";
import { PrismaService } from "../src/modules/prisma/prisma.service";
import { RealtimeService } from "../src/modules/realtime/realtime.service";
import { AuditService } from "../src/modules/audit/audit.service";
import { IntegrationsService } from "../src/modules/integrations/integrations.service";
import { CallsService } from "../src/modules/calls/calls.service";
import { STT_QUEUE } from "../src/modules/queue/queue.module";
import { writeContext } from "../src/common/tenant-context";
import { MockLlmAdapter } from "../../ai-worker/src/llm/mock.llm";

/**
 * Two contracts the on-demand analysis feature must keep:
 * (1) Paid services never auto-run on call completion — only when the
 *     supervisor/operator clicks "Tahlil qil".
 * (2) When an active sales script is supplied, the LLM produces a
 *     non-empty mistakes list (operator deviations vs. the script).
 *
 * Both are cheap (no LLM call) — the STT queue is a mock that just counts
 * adds, and the LLM mistakes test calls the Mock adapter directly.
 */
describe("On-demand call analysis (no auto STT/LLM, mistakes via script)", () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let cls: ClsService;
  let calls: CallsService;

  let tenantId: string;
  let userId: string;
  let contactId: string;

  const runId = `ondemand-${Date.now()}`;
  const sttAdds: Array<{ name: string; data: unknown }> = [];
  const mockSttQueue = {
    add: async (name: string, data: unknown) => {
      sttAdds.push({ name, data });
      return { id: "fake-job" };
    },
  };

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        ClsModule.forRoot({ global: true }),
        EventEmitterModule.forRoot({ wildcard: true }),
      ],
      providers: [
        PrismaService,
        RealtimeService,
        AuditService,
        IntegrationsService,
        CallsService,
        // Inject the mock STT queue so we can count enqueues without spinning
        // up Redis. Without this provider, CallsService's @Optional() queue
        // stays undefined and analyze() throws ServiceUnavailable.
        { provide: STT_QUEUE, useValue: mockSttQueue },
      ],
    }).compile();
    await moduleRef.init();

    cls = moduleRef.get(ClsService);
    prisma = moduleRef.get(PrismaService);
    calls = moduleRef.get(CallsService);
    await prisma.$connect();

    const t = await prisma.tenant.create({ data: { name: `${runId}-t`, status: "ACTIVE" } });
    tenantId = t.id;
    const user = await prisma.user.create({
      data: {
        tenantId,
        fullName: "Op",
        email: `${runId}-op@test.local`,
        passwordHash: "x",
        role: "TENANT_ADMIN",
        status: "ACTIVE",
      },
    });
    userId = user.id;
    const c = await prisma.contact.create({
      data: { tenantId, fullName: "Mijoz", phones: ["+998901230000"] },
    });
    contactId = c.id;
    const pipeline = await prisma.pipeline.create({
      data: { tenantId, name: "P", isDefault: true, order: 0 },
    });
    const stage = await prisma.stage.create({
      data: { tenantId, pipelineId: pipeline.id, name: "S", order: 0, color: "#0ea5e9", type: "NORMAL" },
    });
    await prisma.card.create({
      data: { tenantId, pipelineId: pipeline.id, stageId: stage.id, contactId, title: "C" },
    });
  });

  afterAll(async () => {
    await prisma.qAScore.deleteMany({ where: { call: { tenantId } } });
    await prisma.analysis.deleteMany({ where: { call: { tenantId } } });
    await prisma.transcript.deleteMany({ where: { call: { tenantId } } });
    await prisma.call.deleteMany({ where: { tenantId } });
    await prisma.task.deleteMany({ where: { tenantId } });
    await prisma.card.deleteMany({ where: { tenantId } });
    await prisma.contact.deleteMany({ where: { tenantId } });
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
    sttAdds.length = 0;
  });

  it("completed() on an ANSWERED call does NOT auto-enqueue STT (paid service guard)", async () => {
    const cdrId = `noauto-${Date.now()}`;
    await asTenant(() =>
      calls.completed({
        tenantId,
        cdrUniqueId: cdrId,
        direction: CallDirection.INBOUND,
        fromNumber: "+998901230000",
        toNumber: "+998000000000",
        status: CallStatus.ANSWERED,
        startedAt: new Date().toISOString(),
        duration: 90,
        recordingUrl: "mock://r.wav",
      }),
    );
    expect(sttAdds).toHaveLength(0); // critical: no automatic LLM/STT run
  });

  it("analyze() enqueues STT exactly once and refuses re-run without force", async () => {
    const cdrId = `analyze-${Date.now()}`;
    await asTenant(() =>
      calls.completed({
        tenantId,
        cdrUniqueId: cdrId,
        direction: CallDirection.INBOUND,
        fromNumber: "+998901230000",
        toNumber: "+998000000000",
        status: CallStatus.ANSWERED,
        startedAt: new Date().toISOString(),
        duration: 30,
        recordingUrl: "mock://r2.wav",
      }),
    );
    const call = await asTenant(() =>
      prisma.t.call.findFirst({ where: { cdrUniqueId: cdrId } }),
    );
    expect(call).not.toBeNull();
    expect(sttAdds).toHaveLength(0);

    const r1 = await asTenant(() => calls.analyze(call!.id));
    expect(r1.enqueued).toBe(true);
    expect(sttAdds).toHaveLength(1);

    // Simulate the worker completing the chain by creating Analysis manually.
    await prisma.analysis.create({
      data: { callId: call!.id, sentiment: "positive", topic: "umumiy" },
    });

    // Second call without force → 409 conflict (no second enqueue).
    await expect(asTenant(() => calls.analyze(call!.id))).rejects.toThrow(/allaqachon tahlil/);
    expect(sttAdds).toHaveLength(1);

    // With force=true → enqueues again and wipes the existing Analysis.
    const r2 = await asTenant(() => calls.analyze(call!.id, true));
    expect(r2.enqueued).toBe(true);
    expect(sttAdds).toHaveLength(2);
    const stillThere = await prisma.analysis.findFirst({ where: { callId: call!.id } });
    expect(stillThere).toBeNull();
  });

  it("analyze() refuses non-ANSWERED calls (MISSED has nothing to transcribe)", async () => {
    const cdrId = `missed-${Date.now()}`;
    await asTenant(() =>
      calls.completed({
        tenantId,
        cdrUniqueId: cdrId,
        direction: CallDirection.INBOUND,
        fromNumber: "+998901230000",
        toNumber: "+998000000000",
        status: CallStatus.MISSED,
        startedAt: new Date().toISOString(),
        duration: 0,
      }),
    );
    const call = await asTenant(() =>
      prisma.t.call.findFirst({ where: { cdrUniqueId: cdrId } }),
    );
    await expect(asTenant(() => calls.analyze(call!.id))).rejects.toThrow(
      /faqat javob berilgan/i,
    );
    expect(sttAdds).toHaveLength(0);
  });

  it("MockLlmAdapter.analyze() produces a mistakes list when an active script is supplied", async () => {
    const llm = new MockLlmAdapter();
    const script = {
      name: "Test sales script",
      sections: ["Salomlashish", "Ehtiyoj"],
      criteria: [
        {
          id: "salom",
          section: "Salomlashish",
          text: "Operator salomlashishi va o'zini tanishtirishi shart",
          maxScore: 10,
          keywords: ["assalomu alaykum", "acoustic"],
        },
        {
          id: "ehtiyoj",
          section: "Ehtiyoj",
          text: "Operator mijoz ehtiyojini aniqlashi shart",
          maxScore: 20,
          keywords: ["qachondan", "qiynalasiz"],
        },
      ],
    };
    // Transcript hits the greeting but skips needs-discovery on purpose.
    const result = await llm.analyze(
      {
        text: "Assalomu alaykum, Acoustic markazidan qo'ng'iroq qilyapman. Yaxshi, rahmat.",
        segments: [],
        language: "uz",
      },
      script,
    );
    expect(result.mistakes.length).toBeGreaterThan(0);
    const skipped = result.mistakes.find((m) => m.section === "Ehtiyoj");
    expect(skipped).toBeDefined();
    expect(skipped?.severity).toBe("high"); // maxScore=20 → high severity per mock heuristic
    // Section that WAS satisfied (Salomlashish) shouldn't appear as a mistake.
    expect(result.mistakes.find((m) => m.section === "Salomlashish")).toBeUndefined();
  });

  it("MockLlmAdapter.analyze() returns empty mistakes when no script is supplied", async () => {
    const llm = new MockLlmAdapter();
    const result = await llm.analyze({
      text: "Alo, salom yaxshimisiz?",
      segments: [],
      language: "uz",
    });
    expect(result.mistakes).toEqual([]);
  });
});

