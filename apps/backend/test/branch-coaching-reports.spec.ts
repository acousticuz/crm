import "reflect-metadata";
import { Test, TestingModule } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { ClsModule, ClsService } from "nestjs-cls";
import { UserRole, CallStatus, CallDirection } from "@acoustic-crm/shared";
import { PrismaService } from "../src/modules/prisma/prisma.service";
import { AnalyticsService } from "../src/modules/analytics/analytics.service";
import { writeContext } from "../src/common/tenant-context";

/**
 * Two new analytics surfaces:
 * (1) Per-branch monthly funnel: leads received, WON, LOST, conversion %.
 * (2) Per-operator coaching aggregation: avg QA, weakest sections, top
 *     mistakes, weekly trend.
 *
 * These tests build a small fixture (2 branches, 2 operators, a handful of
 * calls with cards in different terminal stages and analyses with mistakes)
 * and assert the math.
 */
describe("Analytics — branch monthly + operator coaching", () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let cls: ClsService;
  let analytics: AnalyticsService;

  let tenantId: string;
  let branchAId: string;
  let branchBId: string;
  let operatorId: string;
  let scriptId: string;

  const runId = `branch-coach-${Date.now()}`;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        ClsModule.forRoot({ global: true }),
      ],
      providers: [PrismaService, AnalyticsService],
    }).compile();
    await moduleRef.init();

    cls = moduleRef.get(ClsService);
    prisma = moduleRef.get(PrismaService);
    analytics = moduleRef.get(AnalyticsService);
    await prisma.$connect();

    const t = await prisma.tenant.create({ data: { name: `${runId}-t`, status: "ACTIVE" } });
    tenantId = t.id;
    const op = await prisma.user.create({
      data: {
        tenantId,
        fullName: "Coach Operator",
        email: `${runId}-op@test.local`,
        passwordHash: "x",
        role: "OPERATOR",
        status: "ACTIVE",
        extension: "201",
      },
    });
    operatorId = op.id;
    const branchA = await prisma.branch.create({ data: { tenantId, name: `${runId}-Chilonzor` } });
    const branchB = await prisma.branch.create({ data: { tenantId, name: `${runId}-Yunusobod` } });
    branchAId = branchA.id;
    branchBId = branchB.id;

    const pipeline = await prisma.pipeline.create({
      data: { tenantId, name: "P", isDefault: true, order: 0 },
    });
    const stageNew = await prisma.stage.create({
      data: { tenantId, pipelineId: pipeline.id, name: "Yangi", order: 0, color: "#0ea5e9", type: "NORMAL" },
    });
    const stageWon = await prisma.stage.create({
      data: { tenantId, pipelineId: pipeline.id, name: "Yutdi", order: 1, color: "#16a34a", type: "WON" },
    });
    const stageLost = await prisma.stage.create({
      data: { tenantId, pipelineId: pipeline.id, name: "Yo'qotdi", order: 2, color: "#dc2626", type: "LOST" },
    });

    const script = await prisma.script.create({
      data: {
        tenantId,
        name: "Coach script",
        sections: ["Salomlashish", "Ehtiyoj"],
        criteria: [
          { id: "greet", section: "Salomlashish", text: "Salom", maxScore: 10 },
          { id: "needs", section: "Ehtiyoj", text: "Ehtiyoj aniqlash", maxScore: 20 },
        ],
      },
    });
    scriptId = script.id;

    // Branch A: 3 customers — 2 cards (one WON, one LOST) and 1 OPEN.
    // Branch B: 1 customer — OPEN.
    // Plus 1 call without any branch (excluded from the report).
    const month = new Date();
    const inThisMonth = new Date(month.getUTCFullYear(), month.getUTCMonth(), 15, 10, 0, 0);
    async function makeCall(opts: {
      branchId: string | null;
      from: string;
      cardStatus: "OPEN" | "WON" | "LOST";
      qa: { total: number; max: number };
      mistakes?: Array<{ section: string; severity: string; message: string }>;
    }) {
      const contact = await prisma.contact.create({
        data: { tenantId, fullName: "X", phones: [opts.from] },
      });
      const stageId =
        opts.cardStatus === "WON" ? stageWon.id : opts.cardStatus === "LOST" ? stageLost.id : stageNew.id;
      const card = await prisma.card.create({
        data: {
          tenantId,
          pipelineId: pipeline.id,
          stageId,
          contactId: contact.id,
          title: opts.from,
          status: opts.cardStatus,
        },
      });
      const call = await prisma.call.create({
        data: {
          tenantId,
          branchId: opts.branchId,
          contactId: contact.id,
          cardId: card.id,
          operatorId,
          direction: CallDirection.INBOUND,
          fromNumber: opts.from,
          toNumber: "+998000000000",
          status: CallStatus.ANSWERED,
          startedAt: inThisMonth,
          endedAt: inThisMonth,
          duration: 120,
          cdrUniqueId: `${runId}-cdr-${opts.from}`,
        },
      });
      await prisma.analysis.create({
        data: {
          callId: call.id,
          sentiment: "neutral",
          mistakes: opts.mistakes ?? [],
        },
      });
      await prisma.qAScore.create({
        data: {
          callId: call.id,
          scriptId,
          totalScore: opts.qa.total,
          maxScore: opts.qa.max,
          criteriaResults: [
            { criterionId: "greet", passed: opts.qa.total >= 10, score: 10, evidence: "x" },
            { criterionId: "needs", passed: opts.qa.total >= 25, score: opts.qa.total - 10, evidence: "x" },
          ],
        },
      });
      return call;
    }

    await makeCall({
      branchId: branchAId,
      from: "+998900000001",
      cardStatus: "WON",
      qa: { total: 25, max: 30 },
      mistakes: [{ section: "Ehtiyoj", severity: "medium", message: "Ehtiyojni aniqlamadi" }],
    });
    await makeCall({
      branchId: branchAId,
      from: "+998900000002",
      cardStatus: "LOST",
      qa: { total: 10, max: 30 },
      mistakes: [
        { section: "Ehtiyoj", severity: "high", message: "Ehtiyojni aniqlamadi" },
        { section: "Salomlashish", severity: "low", message: "Sekin salomlashdi" },
      ],
    });
    await makeCall({
      branchId: branchAId,
      from: "+998900000003",
      cardStatus: "OPEN",
      qa: { total: 20, max: 30 },
    });
    await makeCall({
      branchId: branchBId,
      from: "+998900000004",
      cardStatus: "OPEN",
      qa: { total: 30, max: 30 },
    });
    await makeCall({
      branchId: null,
      from: "+998900000005",
      cardStatus: "OPEN",
      qa: { total: 15, max: 30 },
    });
  });

  afterAll(async () => {
    await prisma.qAScore.deleteMany({ where: { call: { tenantId } } });
    await prisma.analysis.deleteMany({ where: { call: { tenantId } } });
    await prisma.call.deleteMany({ where: { tenantId } });
    await prisma.card.deleteMany({ where: { tenantId } });
    await prisma.contact.deleteMany({ where: { tenantId } });
    await prisma.stage.deleteMany({ where: { tenantId } });
    await prisma.pipeline.deleteMany({ where: { tenantId } });
    await prisma.script.deleteMany({ where: { tenantId } });
    await prisma.branch.deleteMany({ where: { tenantId } });
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
        email: "sup@test.local",
        skipTenantFilter: false,
      });
      return fn();
    });
  }

  it("branchMonthlyReport: counts leads/won/lost/conversion per branch and ignores branch-less calls", async () => {
    const r = await asTenant(() => analytics.branchMonthlyReport({}));
    const a = r.items.find((b) => b.branchId === branchAId);
    const b = r.items.find((b) => b.branchId === branchBId);
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    // Branch A: 3 calls, 3 unique numbers, 3 cards (1 WON + 1 LOST + 1 OPEN).
    expect(a!.calls).toBe(3);
    expect(a!.uniqueLeads).toBe(3);
    expect(a!.cards).toBe(3);
    expect(a!.won).toBe(1);
    expect(a!.lost).toBe(1);
    expect(a!.open).toBe(1);
    // Conversion = WON / (WON+LOST) = 1/2 = 50%.
    expect(a!.conversionPct).toBe(50);
    // Branch B: only an OPEN card → 0% conversion (no closed deals yet).
    expect(b!.calls).toBe(1);
    expect(b!.won).toBe(0);
    expect(b!.lost).toBe(0);
    expect(b!.conversionPct).toBe(0);
  });

  it("coachingForOperator: avg QA, weakest sections, top mistakes, weekly trend", async () => {
    const r = await asTenant(() =>
      analytics.coachingForOperator({ operatorId }),
    );
    expect(r.operator.fullName).toBe("Coach Operator");
    expect(r.operator.extension).toBe("201");
    expect(r.totalCalls).toBe(5);

    // Average QA% across 5 calls: (25 + 10 + 20 + 30 + 15) / 30 * 100 / 5 = 66.7
    expect(r.avgQaScore).toBeGreaterThan(60);
    expect(r.avgQaScore).toBeLessThan(72);

    // "Ehtiyoj" passed only on the highest-scoring calls, "Salomlashish"
    // passed everywhere except total<10 — so weakest should be Ehtiyoj.
    const weakest = r.weakestSections[0];
    expect(weakest?.section).toBe("Ehtiyoj");

    // Top mistakes — "Ehtiyojni aniqlamadi" repeats twice across the calls.
    const top = r.topMistakes[0];
    expect(top?.message).toBe("Ehtiyojni aniqlamadi");
    expect(top?.count).toBe(2);

    // Trend has at least one weekly bucket.
    expect(r.trend.length).toBeGreaterThan(0);
  });

  it("teamSummary includes extension alongside fullName for the leaderboard", async () => {
    const r = await asTenant(() => analytics.teamSummary({}));
    const row = r.items.find((it) => it.userId === operatorId);
    expect(row).toBeDefined();
    expect(row?.fullName).toBe("Coach Operator");
    expect(row?.extension).toBe("201");
  });
});
