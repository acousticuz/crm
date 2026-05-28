import "reflect-metadata";
import { Test, TestingModule } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { ClsModule, ClsService } from "nestjs-cls";
import { UserRole } from "@acoustic-crm/shared";
import { PrismaService } from "../src/modules/prisma/prisma.service";
import { RealtimeService } from "../src/modules/realtime/realtime.service";
import { TranscriptsService } from "../src/modules/transcripts/transcripts.service";
import { MockSttAdapter } from "../../ai-worker/src/stt/mock.stt";
import { runSttJob } from "../../ai-worker/src/sttJob";
import { writeContext } from "../src/common/tenant-context";

describe("M7 — STT (mock adapter + transcripts pipeline)", () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let cls: ClsService;
  let transcripts: TranscriptsService;

  let tenantId: string;
  let callId: string;

  const runId = `m7-${Date.now()}`;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        ClsModule.forRoot({ global: true }),
        EventEmitterModule.forRoot({ wildcard: true }),
      ],
      providers: [PrismaService, RealtimeService, TranscriptsService],
    }).compile();
    await moduleRef.init();

    cls = moduleRef.get(ClsService);
    prisma = moduleRef.get(PrismaService);
    transcripts = moduleRef.get(TranscriptsService);
    await prisma.$connect();

    const t = await prisma.tenant.create({
      data: { name: `${runId}-tenant`, status: "ACTIVE" },
    });
    tenantId = t.id;
    const contact = await prisma.contact.create({
      data: { tenantId, fullName: "M7 Contact", phones: ["+998901112277"] },
    });
    const call = await prisma.call.create({
      data: {
        tenantId,
        cdrUniqueId: `${runId}-cdr`,
        direction: "INBOUND",
        fromNumber: "+998901112277",
        toNumber: "+998000000000",
        status: "ANSWERED",
        startedAt: new Date(),
        duration: 45,
        recordingUrl: `mock://recordings/${runId}.wav`,
        contactId: contact.id,
      },
    });
    callId = call.id;
  });

  afterAll(async () => {
    await prisma.transcript.deleteMany({ where: { callId } });
    await prisma.call.deleteMany({ where: { tenantId } });
    await prisma.contact.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.$disconnect();
    await moduleRef.close();
  });

  function asTenant<T>(fn: () => Promise<T>): Promise<T> {
    return cls.run(async () => {
      writeContext(cls, {
        tenantId,
        userId: "test-user",
        role: UserRole.TENANT_ADMIN,
        email: "test@m7.local",
        skipTenantFilter: false,
      });
      return fn();
    });
  }

  it("MockSttAdapter produces multi-speaker segments with timestamps + confidence", async () => {
    const adapter = new MockSttAdapter();
    const result = await adapter.transcribe({
      audioUrl: "mock://x.wav",
      callId: "x",
      language: "uz",
    });
    expect(result.language).toBe("uz");
    expect(result.confidence).toBeGreaterThan(0.5);
    expect(result.segments.length).toBeGreaterThan(3);
    const speakers = new Set(result.segments.map((s) => s.speaker));
    expect(speakers.has("operator")).toBe(true);
    expect(speakers.has("customer")).toBe(true);
    // Timestamps monotonically increase.
    let prevEnd = 0;
    for (const s of result.segments) {
      expect(s.start).toBeGreaterThanOrEqual(prevEnd - 0.01);
      expect(s.end).toBeGreaterThan(s.start);
      prevEnd = s.end;
    }
    expect(result.text).toContain("operator:");
    expect(result.text).toContain("customer:");
  });

  it("TranscriptsService.write upserts a transcript row and links to the call", async () => {
    const adapter = new MockSttAdapter();
    const result = await adapter.transcribe({
      audioUrl: "mock://x.wav",
      callId,
      language: "uz",
    });
    const tr = await transcripts.write({
      tenantId,
      callId,
      text: result.text,
      segments: result.segments,
      language: result.language,
      confidence: result.confidence,
    });
    expect(tr.callId).toBe(callId);
    expect(tr.confidence).toBeCloseTo(result.confidence, 3);

    // Card detail surface (read via tenant-scoped client) sees it via the
    // Transcript table; verify it's attached.
    const fromDb = await asTenant(() =>
      prisma.t.transcript.findFirst({ where: { callId } }),
    );
    expect(fromDb).not.toBeNull();
    expect(fromDb!.text).toContain("operator:");
  });

  it("runSttJob end-to-end: mock adapter → backend write → row in DB", async () => {
    // Inline a tiny BackendClient stand-in that calls TranscriptsService
    // directly. Lets us exercise the full ai-worker code path without HTTP.
    const adapter = new MockSttAdapter();
    const backend = {
      writeTranscript: async (body: Parameters<TranscriptsService["write"]>[0]) => {
        await transcripts.write(body);
      },
    } as unknown as Parameters<typeof runSttJob>[1]["backend"];
    await runSttJob(
      {
        callId,
        tenantId,
        recordingUrl: `mock://recordings/${runId}.wav`,
        language: "uz",
      },
      { adapter, backend },
    );
    const row = await asTenant(() =>
      prisma.t.transcript.findFirst({ where: { callId } }),
    );
    expect(row).not.toBeNull();
    expect(row!.segments).toBeTruthy();
    const segs = row!.segments as Array<{ speaker: string }>;
    expect(segs.length).toBeGreaterThan(3);
  });

  it("rejects a transcript whose tenantId does not own the callId", async () => {
    const otherT = await prisma.tenant.create({
      data: { name: `${runId}-other`, status: "ACTIVE" },
    });
    try {
      await expect(
        transcripts.write({
          tenantId: otherT.id,
          callId,
          text: "hijack",
          segments: [],
          language: "uz",
          confidence: 0,
        }),
      ).rejects.toThrow(/not found/);
    } finally {
      await prisma.tenant.delete({ where: { id: otherT.id } });
    }
  });
});
