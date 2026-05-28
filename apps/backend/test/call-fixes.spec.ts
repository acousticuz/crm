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
import { PipelinesService } from "../src/modules/pipelines/pipelines.service";
import { CardsService } from "../src/modules/cards/cards.service";
import { ContactsService } from "../src/modules/contacts/contacts.service";
import { TagsService } from "../src/modules/tags/tags.service";
import { writeContext } from "../src/common/tenant-context";

describe("CALL_FIXES — missed calls saved, unknown→Noma'lum, configurable Kanban", () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let cls: ClsService;
  let calls: CallsService;
  let pipelines: PipelinesService;
  let cards: CardsService;

  let tenantId: string;
  let operatorId: string;
  let pipelineId: string;
  let stageNewId: string;

  const runId = `cf-${Date.now()}`;

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
        PipelinesService,
        CardsService,
        ContactsService,
        TagsService,
      ],
    }).compile();
    await moduleRef.init();

    cls = moduleRef.get(ClsService);
    prisma = moduleRef.get(PrismaService);
    calls = moduleRef.get(CallsService);
    pipelines = moduleRef.get(PipelinesService);
    cards = moduleRef.get(CardsService);
    await prisma.$connect();

    const t = await prisma.tenant.create({ data: { name: `${runId}-t`, status: "ACTIVE" } });
    tenantId = t.id;
    const op = await prisma.user.create({
      data: {
        tenantId,
        fullName: "Op",
        email: `${runId}-op@test.local`,
        passwordHash: "x",
        role: "TENANT_ADMIN",
        status: "ACTIVE",
      },
    });
    operatorId = op.id;
    const pipeline = await prisma.pipeline.create({
      data: { tenantId, name: "Sotuv", isDefault: true, order: 0 },
    });
    pipelineId = pipeline.id;
    const s = await prisma.stage.create({
      data: { tenantId, pipelineId, name: "Yangi", order: 0, color: "#0ea5e9", type: "NORMAL" },
    });
    stageNewId = s.id;
  });

  afterAll(async () => {
    await prisma.task.deleteMany({ where: { tenantId } });
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
        role: UserRole.TENANT_ADMIN,
        email: "op@test.local",
        skipTenantFilter: false,
      });
      return fn();
    });
  }

  // ===== (1) Missed calls are saved =====

  it("a call is created as RINGING on started and never lost", async () => {
    const cdr = `${runId}-ring`;
    await asTenant(() =>
      calls.started({
        tenantId,
        cdrUniqueId: cdr,
        direction: CallDirection.INBOUND,
        fromNumber: "+998901234567",
        toNumber: "+998000000000",
      }),
    );
    const ringing = await asTenant(() =>
      prisma.t.call.findFirst({ where: { cdrUniqueId: cdr } }),
    );
    expect(ringing).not.toBeNull();
    expect(ringing!.status).toBe(CallStatus.RINGING);
    expect(ringing!.endedAt).toBeNull();
  });

  it("a MISSED call is saved (RINGING→MISSED) and auto-creates a callback Task", async () => {
    const cdr = `${runId}-missed`;
    const phone = "+998935551111";
    await asTenant(() =>
      calls.started({
        tenantId,
        cdrUniqueId: cdr,
        direction: CallDirection.INBOUND,
        fromNumber: phone,
        toNumber: "+998000000000",
        operatorId,
      }),
    );
    await asTenant(() =>
      calls.completed({
        tenantId,
        cdrUniqueId: cdr,
        direction: CallDirection.INBOUND,
        fromNumber: phone,
        toNumber: "+998000000000",
        operatorId,
        status: CallStatus.MISSED,
        startedAt: new Date().toISOString(),
        duration: 0,
      }),
    );
    const call = await asTenant(() => prisma.t.call.findFirst({ where: { cdrUniqueId: cdr } }));
    expect(call).not.toBeNull();
    expect(call!.status).toBe(CallStatus.MISSED); // saved, not lost
    expect(call!.endedAt).not.toBeNull();

    // Callback Task auto-created for the operator.
    const task = await asTenant(() =>
      prisma.t.task.findFirst({
        where: { type: "CALL", text: { contains: "qayta qo'ng'iroq" }, contactId: call!.contactId! },
      }),
    );
    expect(task).not.toBeNull();
    expect(task!.assigneeId).toBe(operatorId);
  });

  it("BUSY and FAILED calls are also saved", async () => {
    for (const status of [CallStatus.BUSY, CallStatus.FAILED]) {
      const cdr = `${runId}-${status}`;
      await asTenant(() =>
        calls.completed({
          tenantId,
          cdrUniqueId: cdr,
          direction: CallDirection.OUTBOUND,
          fromNumber: "100",
          toNumber: "+998905550000",
          status,
          startedAt: new Date().toISOString(),
          duration: 0,
        }),
      );
      const call = await asTenant(() => prisma.t.call.findFirst({ where: { cdrUniqueId: cdr } }));
      expect(call?.status).toBe(status);
    }
  });

  // ===== (2) Unknown numbers → "Noma'lum" contact, no duplicate =====

  it("inbound call from unknown number auto-creates a 'Noma'lum' contact", async () => {
    const phone = "+998939990000";
    const r = await asTenant(() =>
      calls.started({
        tenantId,
        cdrUniqueId: `${runId}-unknown1`,
        direction: CallDirection.INBOUND,
        fromNumber: phone,
        toNumber: "+998000000000",
      }),
    );
    expect(r.contactId).not.toBeNull();
    const contact = await asTenant(() =>
      prisma.t.contact.findFirst({ where: { id: r.contactId! } }),
    );
    expect(contact!.fullName).toBe("Noma'lum");
    expect(contact!.source).toBe("inbound_call");
    expect(contact!.phones).toContain(phone);
  });

  it("repeat call from the same unknown number does NOT create a duplicate contact", async () => {
    const phone = "+998939991111";
    const r1 = await asTenant(() =>
      calls.started({
        tenantId,
        cdrUniqueId: `${runId}-dup1`,
        direction: CallDirection.INBOUND,
        fromNumber: phone,
        toNumber: "+998000000000",
      }),
    );
    const r2 = await asTenant(() =>
      calls.completed({
        tenantId,
        cdrUniqueId: `${runId}-dup2`,
        direction: CallDirection.INBOUND,
        fromNumber: phone,
        toNumber: "+998000000000",
        status: CallStatus.ANSWERED,
        startedAt: new Date().toISOString(),
        duration: 30,
      }),
    );
    expect(r2.contactId).toBe(r1.contactId);
    const count = await asTenant(() =>
      prisma.t.contact.count({ where: { phones: { has: phone } } }),
    );
    expect(count).toBe(1);
  });

  it("operator can later rename the 'Noma'lum' contact", async () => {
    const phone = "+998939992222";
    const r = await asTenant(() =>
      calls.started({
        tenantId,
        cdrUniqueId: `${runId}-rename`,
        direction: CallDirection.INBOUND,
        fromNumber: phone,
        toNumber: "+998000000000",
      }),
    );
    await asTenant(() =>
      prisma.t.contact.update({ where: { id: r.contactId! }, data: { fullName: "Aziz Karimov" } }),
    );
    const renamed = await asTenant(() =>
      prisma.t.contact.findFirst({ where: { id: r.contactId! } }),
    );
    expect(renamed!.fullName).toBe("Aziz Karimov");
  });

  // ===== (3) Configurable Kanban — deleting a stage preserves cards =====

  it("deleting a stage moves its cards to another stage (never lost)", async () => {
    // Add a second stage and create cards in stageNew, then delete stageNew.
    const stageB = await asTenant(() =>
      pipelines.createStage(pipelineId, { name: "Bog'lanildi", order: 1, type: undefined as never }),
    );
    const contact = await prisma.contact.create({
      data: { tenantId, fullName: "Card owner", phones: ["+998901119999"] },
    });
    const c1 = await asTenant(() =>
      cards.create({ title: "Card 1", contactId: contact.id, pipelineId, stageId: stageNewId }),
    );
    const c2 = await asTenant(() =>
      cards.create({ title: "Card 2", contactId: contact.id, pipelineId, stageId: stageNewId }),
    );

    const result = await asTenant(() => pipelines.deleteStage(stageNewId));
    expect(result.movedCards).toBe(2);
    expect(result.movedToStageId).toBe(stageB.id);

    // Both cards still exist and now live in stageB.
    const moved1 = await asTenant(() => prisma.t.card.findFirst({ where: { id: c1.id } }));
    const moved2 = await asTenant(() => prisma.t.card.findFirst({ where: { id: c2.id } }));
    expect(moved1?.deletedAt).toBeNull();
    expect(moved2?.deletedAt).toBeNull();
    expect(moved1?.stageId).toBe(stageB.id);
    expect(moved2?.stageId).toBe(stageB.id);

    // The deleted stage is gone.
    const goneStage = await asTenant(() =>
      prisma.t.stage.findFirst({ where: { id: stageNewId, deletedAt: null } }),
    );
    expect(goneStage).toBeNull();
  });

  it("adding stages is unlimited and reorder persists", async () => {
    const created = [];
    for (let i = 0; i < 6; i += 1) {
      created.push(
        await asTenant(() =>
          pipelines.createStage(pipelineId, { name: `Extra ${i}`, order: 10 + i, type: undefined as never }),
        ),
      );
    }
    const stages = await asTenant(() => pipelines.listStages(pipelineId));
    expect(stages.length).toBeGreaterThanOrEqual(6);
    // Reorder: reverse the created ids interleaved with existing — just verify
    // reorder endpoint persists order without losing stages.
    const ids = stages.map((s) => s.id).reverse();
    const reordered = await asTenant(() => pipelines.reorderStages(pipelineId, ids));
    expect(reordered.length).toBe(stages.length);
    expect(reordered[0].id).toBe(ids[0]);
  });

  // ===== missedOnly filter =====

  it("missedOnly filter returns only cards with a MISSED call", async () => {
    const stages = await asTenant(() => pipelines.listStages(pipelineId));
    const stageId = stages[0].id;
    const contact = await prisma.contact.create({
      data: { tenantId, fullName: "Missed owner", phones: ["+998901112000"] },
    });
    const card = await asTenant(() =>
      cards.create({ title: "Has missed", contactId: contact.id, pipelineId, stageId }),
    );
    // Attach a MISSED call directly to the card.
    await prisma.call.create({
      data: {
        tenantId,
        cdrUniqueId: `${runId}-cardmiss`,
        direction: "INBOUND",
        fromNumber: "+998901112000",
        toNumber: "+998000000000",
        status: "MISSED",
        startedAt: new Date(),
        duration: 0,
        contactId: contact.id,
        cardId: card.id,
      },
    });
    const missed = await asTenant(() => cards.list({ pipelineId, missedOnly: true }));
    expect(missed.items.find((c) => c.id === card.id)).toBeTruthy();
    const withMissedFlag = missed.items.find((c) => c.id === card.id) as { hasMissedCall?: boolean };
    expect(withMissedFlag.hasMissedCall).toBe(true);
  });
});
