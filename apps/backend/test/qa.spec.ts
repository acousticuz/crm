import "reflect-metadata";
import { Test, TestingModule } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { ClsModule, ClsService } from "nestjs-cls";
import { UserRole } from "@acoustic-crm/shared";
import { PrismaService } from "../src/modules/prisma/prisma.service";
import { RealtimeService } from "../src/modules/realtime/realtime.service";
import { QaService } from "../src/modules/qa/qa.service";
import { TranscriptsService } from "../src/modules/transcripts/transcripts.service";
import { MockSttAdapter } from "../../ai-worker/src/stt/mock.stt";
import { MockLlmAdapter } from "../../ai-worker/src/llm/mock.llm";
import { runAnalysisJob, runQaJob } from "../../ai-worker/src/aiJobs";
import { writeContext } from "../src/common/tenant-context";

describe("M8 — AI analysis + QA (mock LLM, stable evidence-backed scoring)", () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let cls: ClsService;
  let qa: QaService;
  let transcripts: TranscriptsService;

  let tenantId: string;
  let userId: string;
  let callId: string;
  let scriptId: string;
  const criteriaIds = {
    greeting: "greeting",
    needs: "needs",
    branchInvite: "branch",
    closing: "closing",
  };

  const runId = `m8-${Date.now()}`;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        ClsModule.forRoot({ global: true }),
        EventEmitterModule.forRoot({ wildcard: true }),
      ],
      providers: [PrismaService, RealtimeService, QaService, TranscriptsService],
    }).compile();
    await moduleRef.init();

    cls = moduleRef.get(ClsService);
    prisma = moduleRef.get(PrismaService);
    qa = moduleRef.get(QaService);
    transcripts = moduleRef.get(TranscriptsService);
    await prisma.$connect();

    const t = await prisma.tenant.create({
      data: { name: `${runId}-tenant`, status: "ACTIVE" },
    });
    tenantId = t.id;
    const user = await prisma.user.create({
      data: {
        tenantId,
        fullName: "M8 Supervisor",
        email: `${runId}-sup@test.local`,
        passwordHash: "x",
        role: "SUPERVISOR",
        status: "ACTIVE",
      },
    });
    userId = user.id;
    const contact = await prisma.contact.create({
      data: { tenantId, fullName: "M8 Contact", phones: ["+998901112299"] },
    });
    const call = await prisma.call.create({
      data: {
        tenantId,
        cdrUniqueId: `${runId}-cdr`,
        direction: "INBOUND",
        fromNumber: "+998901112299",
        toNumber: "+998000000000",
        status: "ANSWERED",
        startedAt: new Date(),
        duration: 50,
        recordingUrl: `mock://recordings/${runId}.wav`,
        contactId: contact.id,
      },
    });
    callId = call.id;

    // Write the transcript that downstream tests will analyse + grade.
    const stt = new MockSttAdapter();
    const sttResult = await stt.transcribe({
      audioUrl: "mock://x.wav",
      callId,
      language: "uz",
    });
    await prisma.transcript.create({
      data: {
        callId,
        text: sttResult.text,
        segments: sttResult.segments as unknown as object,
        language: sttResult.language,
        confidence: sttResult.confidence,
      },
    });

    // Create a 4-criterion script. Each criterion's `keywords` is what the
    // mock LLM scans for in the transcript — picked so we get a mix of
    // passed/failed outcomes deterministically.
    const script = await prisma.script.create({
      data: {
        tenantId,
        name: `${runId}-rubric`,
        sections: ["Salomlashish", "Mijoz ehtiyojini aniqlash", "Yakunlash"] as unknown as object,
        criteria: [
          {
            id: criteriaIds.greeting,
            section: "Salomlashish",
            text: "Operator salomlashishni boshlashi kerak",
            maxScore: 10,
            keywords: ["salomu alaykum", "xush kelibsiz"],
          },
          {
            id: criteriaIds.needs,
            section: "Mijoz ehtiyojini aniqlash",
            text: "Operator mijozning xizmat ehtiyojini aniqlashi kerak",
            maxScore: 20,
            keywords: ["qaysi xizmat", "qiziqtiradi"],
          },
          {
            id: criteriaIds.branchInvite,
            section: "Yakunlash",
            text: "Operator filialga taklif qilishi kerak",
            maxScore: 15,
            keywords: ["filial"],
          },
          {
            id: criteriaIds.closing,
            section: "Yakunlash",
            text: "Operator chegirma takliflarini eslatishi kerak",
            maxScore: 15,
            keywords: ["chegirma", "aksiya"], // intentionally absent
          },
        ] as unknown as object,
        isActive: true,
      },
    });
    scriptId = script.id;
  });

  afterAll(async () => {
    await prisma.qAScore.deleteMany({ where: { call: { tenantId } } });
    await prisma.analysis.deleteMany({ where: { call: { tenantId } } });
    await prisma.transcript.deleteMany({ where: { callId } });
    await prisma.script.deleteMany({ where: { tenantId } });
    await prisma.call.deleteMany({ where: { tenantId } });
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
        userId,
        role: UserRole.SUPERVISOR,
        email: "sup@test.local",
        skipTenantFilter: false,
      });
      return fn();
    });
  }

  it("MockLlmAdapter produces a stable analysis with topic + sentiment + tags", async () => {
    const llm = new MockLlmAdapter();
    const tr = await prisma.transcript.findFirst({ where: { callId } });
    const result = await llm.analyze({
      text: tr!.text,
      segments: tr!.segments as never,
      language: tr!.language,
    });
    expect(result.sentiment).toBe("positive"); // mock dialog has "rahmat" + "xursand"
    expect(result.topic).toBe("narx"); // first keyword match in the canned dialog
    expect(result.summary.length).toBeGreaterThan(20);
    expect(result.nextStep).toMatch(/narx/);
    expect(result.suggestedTags).toContain("narx");
    expect(result.keyPoints.length).toBeGreaterThanOrEqual(1);
  });

  it("QA grading: per-criterion passed/score + evidence quoted from transcript; total 0-100 mapping", async () => {
    const llm = new MockLlmAdapter();
    const script = await prisma.script.findFirst({ where: { id: scriptId } });
    const tr = await prisma.transcript.findFirst({ where: { callId } });
    const grade = await llm.grade(
      {
        text: tr!.text,
        segments: tr!.segments as never,
        language: tr!.language,
      },
      script!.criteria as never,
    );
    expect(grade.maxScore).toBe(60); // 10 + 20 + 15 + 15
    expect(grade.criteriaResults).toHaveLength(4);

    const byId = Object.fromEntries(grade.criteriaResults.map((g) => [g.criterionId, g]));
    expect(byId[criteriaIds.greeting].passed).toBe(true);
    expect(byId[criteriaIds.greeting].score).toBe(10);
    expect(byId[criteriaIds.greeting].evidence.toLowerCase()).toMatch(
      /xush kelibsiz|salomu alaykum/,
    );
    expect(byId[criteriaIds.needs].passed).toBe(true);
    expect(byId[criteriaIds.needs].score).toBe(20);
    expect(byId[criteriaIds.branchInvite].passed).toBe(true);
    expect(byId[criteriaIds.branchInvite].score).toBe(15);
    expect(byId[criteriaIds.closing].passed).toBe(false);
    expect(byId[criteriaIds.closing].score).toBe(0);
    expect(byId[criteriaIds.closing].evidence).toBe("evidence not found");

    expect(grade.totalScore).toBe(45);
  });

  it("runAnalysisJob + runQaJob persist Analysis and QAScore through the backend service", async () => {
    const llm = new MockLlmAdapter();
    const tr = await prisma.transcript.findFirst({ where: { callId } });
    const script = await prisma.script.findFirst({ where: { id: scriptId } });
    const backendApi = {
      writeAnalysis: async (body: Parameters<QaService["writeAnalysis"]>[0]) => {
        await qa.writeAnalysis(body);
      },
      writeQAScore: async (body: Parameters<QaService["writeQAScore"]>[0]) => {
        await qa.writeQAScore(body);
      },
    } as Parameters<typeof runAnalysisJob>[1]["backend"];

    await runAnalysisJob(
      {
        tenantId,
        callId,
        transcript: {
          text: tr!.text,
          segments: tr!.segments as never,
          language: tr!.language,
        },
      },
      { llm, backend: backendApi },
    );

    const analysis = await asTenant(() =>
      prisma.t.analysis.findFirst({ where: { callId } }),
    );
    expect(analysis).not.toBeNull();
    expect(analysis!.sentiment).toBe("positive");
    expect(analysis!.topic).toBe("narx");

    await runQaJob(
      {
        tenantId,
        callId,
        scriptId,
        transcript: {
          text: tr!.text,
          segments: tr!.segments as never,
          language: tr!.language,
        },
        criteria: script!.criteria as never,
      },
      { llm, backend: backendApi },
    );

    const score = await asTenant(() =>
      prisma.t.qAScore.findFirst({ where: { callId, scriptId } }),
    );
    expect(score).not.toBeNull();
    expect(score!.totalScore).toBe(45);
    expect(score!.maxScore).toBe(60);
  });

  it("supervisor override stores override JSON + reviewedBy and is idempotent", async () => {
    const existing = await asTenant(() =>
      prisma.t.qAScore.findFirst({ where: { callId, scriptId } }),
    );
    const overridden = await asTenant(() =>
      qa.overrideScore(
        existing!.id,
        { override: { totalScore: 50, note: "Filialga taklif yaxshi ko'rsatildi" } },
        userId,
      ),
    );
    expect(overridden.reviewedBy).toBe(userId);
    const o = overridden.supervisorOverride as Record<string, unknown> | null;
    expect(o?.totalScore).toBe(50);
    expect(o?.note).toMatch(/Filialga taklif/);
  });

  it("scorecard() includes analysis + qaScores + transcript on the call", async () => {
    const card = await asTenant(() => qa.scorecard(callId));
    expect(card.analysis?.sentiment).toBe("positive");
    expect(card.qaScores.length).toBeGreaterThanOrEqual(1);
    expect(card.transcript?.confidence).toBeGreaterThan(0.5);
  });

  it("internal writeAnalysis() rejects cross-tenant payloads", async () => {
    const otherT = await prisma.tenant.create({
      data: { name: `${runId}-other`, status: "ACTIVE" },
    });
    try {
      await expect(
        qa.writeAnalysis({
          tenantId: otherT.id,
          callId,
          sentiment: "negative",
          topic: "hijack",
          summary: "x",
          nextStep: "x",
          keyPoints: [],
          suggestedTags: [],
        }),
      ).rejects.toThrow(/not found/);
    } finally {
      await prisma.tenant.delete({ where: { id: otherT.id } });
    }
  });
});
