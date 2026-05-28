import "reflect-metadata";
import { Test, TestingModule } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { ClsModule, ClsService } from "nestjs-cls";
import { CallDirection, CallStatus, UserRole, SmsStatus } from "@acoustic-crm/shared";
import { PrismaService } from "../src/modules/prisma/prisma.service";
import { RealtimeService } from "../src/modules/realtime/realtime.service";
import { AuditService } from "../src/modules/audit/audit.service";
import { CallsService } from "../src/modules/calls/calls.service";
import { TranscriptsService } from "../src/modules/transcripts/transcripts.service";
import { QaService } from "../src/modules/qa/qa.service";
import { TriggersService } from "../src/modules/triggers/triggers.service";
import { TriggerEngine } from "../src/modules/triggers/trigger.engine";
import { SmsService } from "../src/modules/sms/sms.service";
import { SmsAdapterFactory } from "../src/modules/sms/sms-adapter.factory";
import { SmsRateLimiter } from "../src/modules/sms/rate-limiter";
import { MockSmsAdapter } from "../src/modules/sms/adapters/mock.adapter";
import { EskizSmsAdapter } from "../src/modules/sms/adapters/eskiz.adapter";
import { PlayMobileSmsAdapter } from "../src/modules/sms/adapters/playmobile.adapter";
import { CardsService } from "../src/modules/cards/cards.service";
import { ContactsService } from "../src/modules/contacts/contacts.service";
import { TagsService } from "../src/modules/tags/tags.service";
import { MockSttAdapter } from "../../ai-worker/src/stt/mock.stt";
import { MockLlmAdapter } from "../../ai-worker/src/llm/mock.llm";
import { runAnalysisJob, runQaJob } from "../../ai-worker/src/aiJobs";
import { runSttJob } from "../../ai-worker/src/sttJob";
import { writeContext } from "../src/common/tenant-context";

/**
 * M11 smoke-test: drives the entire CLAUDE.md pipeline end-to-end on the
 * dev database with all mock adapters. If this passes, a fresh deploy is
 * known to work: a single inbound call eventually produces a transcript, an
 * AI analysis, a QA scorecard, AND a triggered SMS.
 *
 * Flow exercised:
 *   1.  AMI completed event  → Call row + screen-pop (via CallsService)
 *   2.  STT job              → Transcript row attached to the call
 *   3.  Analysis job         → Analysis row + auto-enqueue QA per script
 *   4.  QA job               → QAScore row with per-criterion evidence
 *   5.  Card moved to a stage where a trigger is configured
 *   6.  Trigger fires the `sms` action → SmsLog row in DB
 */
describe("M11 — Full pipeline smoke test", () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let cls: ClsService;
  let calls: CallsService;
  let transcripts: TranscriptsService;
  let qa: QaService;
  let triggers: TriggersService;
  let cards: CardsService;
  let sms: SmsService;
  let mockSms: MockSmsAdapter;

  let tenantId: string;
  let operatorId: string;
  let contactId: string;
  let pipelineId: string;
  let stageFromId: string;
  let stageWonId: string;
  let scriptId: string;
  let cardId: string;

  const runId = `smoke-${Date.now()}`;

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
        CallsService,
        TranscriptsService,
        QaService,
        TriggersService,
        TriggerEngine,
        SmsService,
        SmsAdapterFactory,
        SmsRateLimiter,
        MockSmsAdapter,
        EskizSmsAdapter,
        PlayMobileSmsAdapter,
        CardsService,
        ContactsService,
        TagsService,
      ],
    }).compile();
    await moduleRef.init();

    cls = moduleRef.get(ClsService);
    prisma = moduleRef.get(PrismaService);
    calls = moduleRef.get(CallsService);
    transcripts = moduleRef.get(TranscriptsService);
    qa = moduleRef.get(QaService);
    triggers = moduleRef.get(TriggersService);
    cards = moduleRef.get(CardsService);
    sms = moduleRef.get(SmsService);
    mockSms = moduleRef.get(MockSmsAdapter);
    await prisma.$connect();

    // Tenant + supporting fixtures.
    const tenant = await prisma.tenant.create({
      data: {
        name: `${runId}-acoustic`,
        status: "ACTIVE",
        smsConfig: { provider: "mock" },
      },
    });
    tenantId = tenant.id;
    const operator = await prisma.user.create({
      data: {
        tenantId,
        fullName: "Smoke Operator",
        email: `${runId}-op@acoustic.uz`,
        passwordHash: "x",
        role: "OPERATOR",
        status: "ACTIVE",
      },
    });
    operatorId = operator.id;
    const contact = await prisma.contact.create({
      data: {
        tenantId,
        fullName: "Smoke Mijoz",
        phones: ["+998901234567"],
        source: "website",
      },
    });
    contactId = contact.id;
    const pipeline = await prisma.pipeline.create({
      data: { tenantId, name: "Smoke pipeline", isDefault: true, order: 0 },
    });
    pipelineId = pipeline.id;
    const sFrom = await prisma.stage.create({
      data: {
        tenantId,
        pipelineId,
        name: "Yangi",
        order: 0,
        color: "#0ea5e9",
        type: "NORMAL",
      },
    });
    stageFromId = sFrom.id;
    const sWon = await prisma.stage.create({
      data: {
        tenantId,
        pipelineId,
        name: "Yutdi",
        order: 1,
        color: "#16a34a",
        type: "WON",
      },
    });
    stageWonId = sWon.id;
    const script = await prisma.script.create({
      data: {
        tenantId,
        name: "Acoustic standart",
        sections: ["Salomlashish", "Mijoz ehtiyoji", "Yakunlash"] as unknown as object,
        criteria: [
          { id: "greeting", section: "Salomlashish", text: "Salomlashish", maxScore: 10, keywords: ["xush kelibsiz"] },
          { id: "needs", section: "Mijoz ehtiyoji", text: "Ehtiyoj", maxScore: 25, keywords: ["qaysi xizmat"] },
          { id: "branch", section: "Yakunlash", text: "Filial", maxScore: 20, keywords: ["filial"] },
          { id: "warm", section: "Yakunlash", text: "Iliq tugatish", maxScore: 15, keywords: ["rahmat"] },
        ] as unknown as object,
        isActive: true,
      },
    });
    scriptId = script.id;
    // SMS template referenced by the trigger.
    await prisma.smsTemplate.create({
      data: {
        tenantId,
        name: "smoke-thanks",
        body: "Salom {ism}, savdoyimiz {sana} kuni tasdiqlandi. Rahmat!",
      },
    });
  });

  afterAll(async () => {
    await prisma.smsLog.deleteMany({ where: { tenantId } });
    await prisma.smsTemplate.deleteMany({ where: { tenantId } });
    await prisma.auditLog.deleteMany({ where: { tenantId } });
    await prisma.qAScore.deleteMany({ where: { script: { tenantId } } });
    await prisma.analysis.deleteMany({ where: { call: { tenantId } } });
    await prisma.transcript.deleteMany({ where: { call: { tenantId } } });
    await prisma.script.deleteMany({ where: { tenantId } });
    await prisma.trigger.deleteMany({ where: { tenantId } });
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
        email: "smoke@acoustic.uz",
        skipTenantFilter: false,
      });
      return fn();
    });
  }

  it("end-to-end: call → transcript → analysis → QA → trigger → SMS", async () => {
    mockSms.reset();

    // Step 1 — AMI reports a completed inbound call.
    const cdrId = `${runId}-cdr`;
    const call = await asTenant(() =>
      calls.completed({
        tenantId,
        cdrUniqueId: cdrId,
        direction: CallDirection.INBOUND,
        fromNumber: "+998901234567",
        toNumber: "+998000000000",
        status: CallStatus.ANSWERED,
        startedAt: new Date().toISOString(),
        duration: 60,
        operatorId,
        recordingUrl: `mock://recordings/${cdrId}.wav`,
      }),
    );
    expect(call.contactId).toBe(contactId);

    // Step 2 — STT job writes a transcript via the service.
    const stt = new MockSttAdapter();
    const sttBackend = {
      writeTranscript: async (body: Parameters<TranscriptsService["write"]>[0]) => {
        await transcripts.write(body);
      },
    } as unknown as Parameters<typeof runSttJob>[1]["backend"];
    await runSttJob(
      {
        callId: call.id,
        tenantId,
        recordingUrl: call.recordingUrl!,
        language: "uz",
      },
      { adapter: stt, backend: sttBackend },
    );
    const transcript = await asTenant(() =>
      prisma.t.transcript.findFirst({ where: { callId: call.id } }),
    );
    expect(transcript).not.toBeNull();

    // Step 3 — Analysis job → Analysis row.
    const llm = new MockLlmAdapter();
    const llmBackend = {
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
        callId: call.id,
        transcript: {
          text: transcript!.text,
          segments: transcript!.segments as never,
          language: transcript!.language,
        },
      },
      { llm, backend: llmBackend },
    );
    const analysis = await asTenant(() =>
      prisma.t.analysis.findFirst({ where: { callId: call.id } }),
    );
    expect(analysis?.sentiment).toBeTruthy();

    // Step 4 — QA job → QAScore row.
    await runQaJob(
      {
        tenantId,
        callId: call.id,
        scriptId,
        transcript: {
          text: transcript!.text,
          segments: transcript!.segments as never,
          language: transcript!.language,
        },
        criteria: [
          { id: "greeting", section: "Salomlashish", text: "Salomlashish", maxScore: 10, keywords: ["xush kelibsiz"] },
          { id: "needs", section: "Mijoz ehtiyoji", text: "Ehtiyoj", maxScore: 25, keywords: ["qaysi xizmat"] },
          { id: "branch", section: "Yakunlash", text: "Filial", maxScore: 20, keywords: ["filial"] },
          { id: "warm", section: "Yakunlash", text: "Iliq tugatish", maxScore: 15, keywords: ["rahmat"] },
        ],
      },
      { llm, backend: llmBackend },
    );
    const score = await asTenant(() =>
      prisma.t.qAScore.findFirst({ where: { callId: call.id, scriptId } }),
    );
    expect(score?.totalScore).toBeGreaterThan(0);
    expect(score?.maxScore).toBe(70);

    // Step 5 — Configure a trigger that sends an SMS when a card lands on
    // the WON stage, then create + move a card to fire it.
    await asTenant(() =>
      triggers.create({
        name: "smoke-sms-on-won",
        event: { type: "card.moved", stageId: stageWonId },
        conditions: {},
        actions: [{ type: "sms", text: "Salom {ism}, savdoyimiz tasdiqlandi. Rahmat!" }],
      }),
    );

    const card = await asTenant(() =>
      cards.create({
        title: "Smoke deal",
        contactId,
        pipelineId,
        stageId: stageFromId,
      }),
    );
    cardId = card.id;
    await asTenant(() => cards.move(card.id, { stageId: stageWonId }));

    // Step 6 — Wait for the async trigger → SMS pipeline to settle. The
    // SmsModule onModuleInit registers itself with TriggerEngine; emit() is
    // sync but listener handlers are async.
    const deadline = Date.now() + 3000;
    while (mockSms.sent.length === 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 25));
    }
    expect(mockSms.sent.length).toBeGreaterThanOrEqual(1);
    const last = mockSms.sent[mockSms.sent.length - 1];
    expect(last.phone).toBe("+998901234567");
    expect(last.text).toContain("Smoke Mijoz");

    // And the SmsLog row is persisted in the right tenant.
    const log = await asTenant(() =>
      prisma.t.smsLog.findFirst({
        where: { phone: "+998901234567" },
        orderBy: { createdAt: "desc" },
      }),
    );
    expect(log?.status).toBe(SmsStatus.SENT);
    expect(log?.provider).toBe("mock");

    // Sanity: clean up the card so afterAll doesn't trip on FK.
    void cardId; // referenced for clarity
  }, 30000);
});
