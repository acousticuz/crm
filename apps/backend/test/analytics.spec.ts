import "reflect-metadata";
import { Test, TestingModule } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { ClsModule, ClsService } from "nestjs-cls";
import { UserRole } from "@acoustic-crm/shared";
import { PrismaService } from "../src/modules/prisma/prisma.service";
import { RealtimeService } from "../src/modules/realtime/realtime.service";
import { AnalyticsService } from "../src/modules/analytics/analytics.service";
import { writeContext } from "../src/common/tenant-context";

describe("M9 — Analytics + KPI", () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let cls: ClsService;
  let analytics: AnalyticsService;

  let tenantId: string;
  let operatorId: string;
  let otherOperatorId: string;

  const runId = `m9-${Date.now()}`;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        ClsModule.forRoot({ global: true }),
        EventEmitterModule.forRoot({ wildcard: true }),
      ],
      providers: [PrismaService, RealtimeService, AnalyticsService],
    }).compile();
    await moduleRef.init();

    cls = moduleRef.get(ClsService);
    prisma = moduleRef.get(PrismaService);
    analytics = moduleRef.get(AnalyticsService);
    await prisma.$connect();

    const t = await prisma.tenant.create({
      data: { name: `${runId}-tenant`, status: "ACTIVE" },
    });
    tenantId = t.id;
    const u1 = await prisma.user.create({
      data: {
        tenantId,
        fullName: "Op One",
        email: `${runId}-op1@test.local`,
        passwordHash: "x",
        role: "OPERATOR",
      },
    });
    operatorId = u1.id;
    const u2 = await prisma.user.create({
      data: {
        tenantId,
        fullName: "Op Two",
        email: `${runId}-op2@test.local`,
        passwordHash: "x",
        role: "OPERATOR",
      },
    });
    otherOperatorId = u2.id;
    const contact = await prisma.contact.create({
      data: { tenantId, fullName: "Test", phones: ["+998901112299"] },
    });

    const pipeline = await prisma.pipeline.create({
      data: { tenantId, name: "Sotuv", isDefault: true, order: 0 },
    });
    const stageWon = await prisma.stage.create({
      data: { tenantId, pipelineId: pipeline.id, name: "Yutdi", order: 0, color: "#16a34a", type: "WON" },
    });
    const stageLost = await prisma.stage.create({
      data: { tenantId, pipelineId: pipeline.id, name: "Yo'q", order: 1, color: "#dc2626", type: "LOST" },
    });
    // 3 OPEN + 2 WON + 1 LOST for operator one — conversion = 2/(2+1) = 67%
    await prisma.card.createMany({
      data: [
        ...Array(3).fill(0).map(() => ({
          tenantId,
          pipelineId: pipeline.id,
          stageId: stageWon.id,
          contactId: contact.id,
          title: "open",
          status: "OPEN" as const,
          responsibleUserId: operatorId,
        })),
        ...Array(2).fill(0).map(() => ({
          tenantId,
          pipelineId: pipeline.id,
          stageId: stageWon.id,
          contactId: contact.id,
          title: "won",
          status: "WON" as const,
          responsibleUserId: operatorId,
        })),
        {
          tenantId,
          pipelineId: pipeline.id,
          stageId: stageLost.id,
          contactId: contact.id,
          title: "lost",
          status: "LOST" as const,
          responsibleUserId: operatorId,
        },
      ],
    });

    // Calls: 4 inbound (3 answered + 1 missed), 2 outbound answered, all for operator one.
    const baseDate = new Date("2026-05-20T10:00:00Z");
    const callIds: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const c = await prisma.call.create({
        data: {
          tenantId,
          cdrUniqueId: `${runId}-in-${i}`,
          direction: "INBOUND",
          fromNumber: "+998901112299",
          toNumber: "+998000000000",
          status: "ANSWERED",
          startedAt: new Date(baseDate.getTime() + i * 3_600_000),
          duration: 60 + i * 30,
          operatorId,
          contactId: contact.id,
        },
      });
      callIds.push(c.id);
    }
    await prisma.call.create({
      data: {
        tenantId,
        cdrUniqueId: `${runId}-in-miss`,
        direction: "INBOUND",
        fromNumber: "+998901112299",
        toNumber: "+998000000000",
        status: "MISSED",
        startedAt: baseDate,
        duration: 0,
        operatorId,
        contactId: contact.id,
      },
    });
    for (let i = 0; i < 2; i += 1) {
      const c = await prisma.call.create({
        data: {
          tenantId,
          cdrUniqueId: `${runId}-out-${i}`,
          direction: "OUTBOUND",
          fromNumber: "+998000000000",
          toNumber: "+998901112299",
          status: "ANSWERED",
          startedAt: new Date(baseDate.getTime() + (i + 5) * 3_600_000),
          duration: 90,
          operatorId,
          contactId: contact.id,
        },
      });
      callIds.push(c.id);
    }

    // Analyses: positive=3, negative=1, neutral=1.
    const sentiments = ["positive", "positive", "positive", "negative", "neutral"];
    for (let i = 0; i < 5; i += 1) {
      await prisma.analysis.create({
        data: {
          callId: callIds[i],
          sentiment: sentiments[i],
          topic: "narx",
          summary: "x",
          nextStep: "y",
        },
      });
    }

    // QAScores: bespoke results — criteriaResults with mix of passed/failed.
    const script = await prisma.script.create({
      data: {
        tenantId,
        name: `${runId}-rubric`,
        sections: ["A"] as unknown as object,
        criteria: [
          { id: "c1", section: "A", text: "Greeting", maxScore: 10 },
          { id: "c2", section: "A", text: "Needs", maxScore: 10 },
          { id: "c3", section: "A", text: "Branch", maxScore: 10 },
        ] as unknown as object,
      },
    });
    for (let i = 0; i < 3; i += 1) {
      // Each call: c1 passes, c2 passes, c3 fails → totalScore = 20/30
      await prisma.qAScore.create({
        data: {
          callId: callIds[i],
          scriptId: script.id,
          totalScore: 20,
          maxScore: 30,
          criteriaResults: [
            { criterionId: "c1", passed: true, score: 10, evidence: "salom" },
            { criterionId: "c2", passed: true, score: 10, evidence: "ehtiyoj" },
            { criterionId: "c3", passed: false, score: 0, evidence: "evidence not found" },
          ] as unknown as object,
        },
      });
    }
  });

  afterAll(async () => {
    await prisma.qAScore.deleteMany({ where: { script: { tenantId } } });
    await prisma.analysis.deleteMany({ where: { call: { tenantId } } });
    await prisma.script.deleteMany({ where: { tenantId } });
    await prisma.call.deleteMany({ where: { tenantId } });
    await prisma.card.deleteMany({ where: { tenantId } });
    await prisma.stage.deleteMany({ where: { tenantId } });
    await prisma.pipeline.deleteMany({ where: { tenantId } });
    await prisma.contact.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.$disconnect();
    await moduleRef.close();
  });

  function asTenant<T>(fn: () => Promise<T>): Promise<T> {
    return cls.run(async () => {
      writeContext(cls, {
        tenantId,
        userId: operatorId,
        role: UserRole.SUPERVISOR,
        email: "test@m9.local",
        skipTenantFilter: false,
      });
      return fn();
    });
  }

  it("operatorKpi: counts, avgs, conversion, sentiment all match the seeded fixture", async () => {
    const kpi = await asTenant(() => analytics.operatorKpi({ userId: operatorId }));
    expect(kpi.callsInbound).toBe(3);
    expect(kpi.callsOutbound).toBe(2);
    expect(kpi.callsMissed).toBe(1);
    expect(kpi.avgQaScore).toBeCloseTo(66.7, 0); // 20/30 = 66.67%
    expect(kpi.scriptAdherencePct).toBeCloseTo(66.7, 0); // 2/3 criteria pass per call
    expect(kpi.conversionPct).toBeCloseTo(66.7, 0); // 2 WON / (2 WON + 1 LOST)
    expect(kpi.sentiment.positive).toBe(3);
    expect(kpi.sentiment.negative).toBe(1);
    expect(kpi.sentiment.neutral).toBe(1);
    expect(kpi.avgDurationSec).toBeGreaterThan(0);
  });

  it("operatorKpi: a different operator with no data returns zeroes", async () => {
    const kpi = await asTenant(() => analytics.operatorKpi({ userId: otherOperatorId }));
    expect(kpi.callsInbound).toBe(0);
    expect(kpi.callsOutbound).toBe(0);
    expect(kpi.avgQaScore).toBe(0);
    expect(kpi.scriptAdherencePct).toBe(0);
    expect(kpi.conversionPct).toBe(0);
  });

  it("weakestCriteria identifies c3 (always fails) and ranks c1/c2 as strongest", async () => {
    const r = await asTenant(() => analytics.weakestCriteria({ limit: 5 }));
    expect(r.totalCriteria).toBe(3);
    expect(r.weakest[0].criterionId).toBe("c3");
    expect(r.weakest[0].passRate).toBe(0);
    expect(r.strongest[0].passRate).toBe(100);
    // Pass rate sample counts equal number of calls graded (3).
    expect(r.weakest[0].samples).toBe(3);
  });

  it("teamSummary lists every operator with their KPI", async () => {
    const team = await asTenant(() => analytics.teamSummary({}));
    const op = team.items.find((r) => r.userId === operatorId);
    expect(op?.callsInbound).toBe(3);
    expect(op?.fullName).toBe("Op One");
    const op2 = team.items.find((r) => r.userId === otherOperatorId);
    expect(op2?.callsInbound).toBe(0);
  });

  it("trends groups calls by day", async () => {
    const t = await asTenant(() => analytics.trends({ groupBy: "day" }));
    expect(t.groupBy).toBe("day");
    expect(t.items.length).toBeGreaterThanOrEqual(1);
    const totalCalls = t.items.reduce(
      (a, b) => a + b.callsInbound + b.callsOutbound + b.callsMissed,
      0,
    );
    expect(totalCalls).toBe(6);
  });
});
