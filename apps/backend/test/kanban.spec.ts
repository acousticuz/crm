import "reflect-metadata";
import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException } from "@nestjs/common";
import { ClsModule, ClsService } from "nestjs-cls";
import { UserRole, StageType } from "@acoustic-crm/shared";
import { PrismaService } from "../src/modules/prisma/prisma.service";
import { PipelinesService } from "../src/modules/pipelines/pipelines.service";
import { CardsService } from "../src/modules/cards/cards.service";
import { TagsService } from "../src/modules/tags/tags.service";
import { NotesService } from "../src/modules/notes/notes.service";
import { TasksService } from "../src/modules/tasks/tasks.service";
import { RealtimeService } from "../src/modules/realtime/realtime.service";
import { writeContext } from "../src/common/tenant-context";

describe("M3 — Kanban (pipelines, stages, cards, tags, notes, tasks)", () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let cls: ClsService;
  let pipelines: PipelinesService;
  let cards: CardsService;
  let tags: TagsService;
  let notes: NotesService;
  let tasks: TasksService;

  let tenantId: string;
  let userId: string;
  let contactId: string;
  let pipelineId: string;
  let stageNewId: string;
  let stageQualifiedId: string;
  let stageWonId: string;

  const runId = `m3-${Date.now()}`;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ClsModule.forRoot({ global: true })],
      providers: [
        PrismaService,
        PipelinesService,
        CardsService,
        TagsService,
        NotesService,
        TasksService,
        RealtimeService,
      ],
    }).compile();

    cls = moduleRef.get(ClsService);
    prisma = moduleRef.get(PrismaService);
    pipelines = moduleRef.get(PipelinesService);
    cards = moduleRef.get(CardsService);
    tags = moduleRef.get(TagsService);
    notes = moduleRef.get(NotesService);
    tasks = moduleRef.get(TasksService);
    await prisma.$connect();

    const t = await prisma.tenant.create({
      data: { name: `${runId}-tenant`, status: "ACTIVE" },
    });
    tenantId = t.id;
    const user = await prisma.user.create({
      data: {
        tenantId,
        fullName: "Test Admin",
        email: `${runId}-admin@test.local`,
        passwordHash: "x",
        role: "TENANT_ADMIN",
        status: "ACTIVE",
      },
    });
    userId = user.id;
    const c = await prisma.contact.create({
      data: { tenantId, fullName: "Test Contact", phones: ["+998901112200"] },
    });
    contactId = c.id;
    const p = await prisma.pipeline.create({
      data: { tenantId, name: "Default", isDefault: true, order: 0 },
    });
    pipelineId = p.id;
    const sNew = await prisma.stage.create({
      data: {
        tenantId,
        pipelineId,
        name: "Yangi",
        order: 0,
        color: "#0ea5e9",
        type: "NORMAL",
      },
    });
    stageNewId = sNew.id;
    const sQual = await prisma.stage.create({
      data: {
        tenantId,
        pipelineId,
        name: "Qualified",
        order: 1,
        color: "#22c55e",
        type: "NORMAL",
      },
    });
    stageQualifiedId = sQual.id;
    const sWon = await prisma.stage.create({
      data: {
        tenantId,
        pipelineId,
        name: "Yutdi",
        order: 2,
        color: "#16a34a",
        type: "WON",
      },
    });
    stageWonId = sWon.id;
  });

  afterAll(async () => {
    await prisma.cardTag.deleteMany({ where: { card: { tenantId } } });
    await prisma.note.deleteMany({ where: { tenantId } });
    await prisma.task.deleteMany({ where: { tenantId } });
    await prisma.card.deleteMany({ where: { tenantId } });
    await prisma.tag.deleteMany({ where: { tenantId } });
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
        userId,
        role: UserRole.TENANT_ADMIN,
        email: "admin@test.local",
        skipTenantFilter: false,
      });
      return fn();
    });
  }

  it("lists pipelines with nested stages ordered by `order`", async () => {
    const all = await asTenant(() => pipelines.listPipelines());
    const found = all.find((p) => p.id === pipelineId);
    expect(found).toBeTruthy();
    expect(found!.stages.map((s) => s.name)).toEqual(["Yangi", "Qualified", "Yutdi"]);
  });

  it("creates a card with default pipeline + first NORMAL stage when not specified", async () => {
    const card = await asTenant(() =>
      cards.create({ title: "Lead from website", contactId }),
    );
    expect(card.pipelineId).toBe(pipelineId);
    expect(card.stageId).toBe(stageNewId);
    expect(card.status).toBe("OPEN");
  });

  it("moves a card across stages, updates enteredStageAt, and flips status when landing on WON", async () => {
    const card = await asTenant(() => cards.create({ title: "Movable", contactId }));
    const before = card.enteredStageAt;

    const toQualified = await asTenant(() => cards.move(card.id, { stageId: stageQualifiedId }));
    expect(toQualified.stageId).toBe(stageQualifiedId);
    expect(toQualified.status).toBe("OPEN");
    expect(toQualified.enteredStageAt.getTime()).toBeGreaterThanOrEqual(before.getTime());

    const won = await asTenant(() => cards.move(card.id, { stageId: stageWonId }));
    expect(won.stageId).toBe(stageWonId);
    expect(won.status).toBe("WON");
  });

  it("rejects moves to a stage in a different pipeline", async () => {
    const otherPipeline = await prisma.pipeline.create({
      data: { tenantId, name: "Other", order: 99 },
    });
    const stageOther = await prisma.stage.create({
      data: {
        tenantId,
        pipelineId: otherPipeline.id,
        name: "Foreign",
        order: 0,
        color: "#000000",
        type: "NORMAL",
      },
    });
    try {
      const card = await asTenant(() => cards.create({ title: "X", contactId }));
      await expect(
        asTenant(() => cards.move(card.id, { stageId: stageOther.id })),
      ).rejects.toBeInstanceOf(BadRequestException);
    } finally {
      await prisma.stage.delete({ where: { id: stageOther.id } });
      await prisma.pipeline.delete({ where: { id: otherPipeline.id } });
    }
  });

  it("filters cards by tagId via CardTag join", async () => {
    const card = await asTenant(() => cards.create({ title: "Tagged", contactId }));
    const tag = await asTenant(() => tags.create({ name: `vip-${runId}` }));
    await asTenant(() => tags.attach(card.id, tag.id));

    const filtered = await asTenant(() => cards.list({ tagId: tag.id }));
    expect(filtered.items.find((c) => c.id === card.id)).toBeTruthy();

    // Detach removes from the filter.
    await asTenant(() => tags.detach(card.id, tag.id));
    const afterDetach = await asTenant(() => cards.list({ tagId: tag.id }));
    expect(afterDetach.items.find((c) => c.id === card.id)).toBeFalsy();
  });

  it("quick-search by contact name and by phone surfaces the right card", async () => {
    const phone = "+998999111222";
    const c = await prisma.contact.create({
      data: {
        tenantId,
        fullName: "Searchable Person",
        phones: [phone],
      },
    });
    const card = await asTenant(() =>
      cards.create({ title: "Search target", contactId: c.id }),
    );

    const byName = await asTenant(() => cards.list({ q: "Searchable" }));
    expect(byName.items.find((cc) => cc.id === card.id)).toBeTruthy();

    const byPhone = await asTenant(() => cards.list({ q: "999 111 222" }));
    expect(byPhone.items.find((cc) => cc.id === card.id)).toBeTruthy();
  });

  it("card detail panel returns contact + tags + tasks + notes + (empty) calls/sms", async () => {
    const card = await asTenant(() => cards.create({ title: "Detail target", contactId }));
    const tag = await asTenant(() => tags.create({ name: `detail-${runId}` }));
    await asTenant(() => tags.attach(card.id, tag.id));
    await asTenant(() =>
      notes.create({ cardId: card.id, text: "First note" }),
    );
    await asTenant(() =>
      tasks.create({
        cardId: card.id,
        assigneeId: userId,
        text: "Call back",
        dueAt: new Date(Date.now() + 86_400_000).toISOString(),
      }),
    );
    const detail = await asTenant(() => cards.findById(card.id));
    expect(detail.contact.id).toBe(contactId);
    expect(detail.cardTags.length).toBeGreaterThan(0);
    expect(detail.notes.length).toBe(1);
    expect(detail.tasks.length).toBe(1);
    expect(detail.calls.length).toBe(0); // M6 will fill in
    expect(detail.smsLogs.length).toBe(0); // M5 will fill in
  });

  it("complete a task records completedAt", async () => {
    const task = await asTenant(() =>
      tasks.create({
        cardId: null as never,
        contactId,
        assigneeId: userId,
        text: "Callback in 1h",
        dueAt: new Date(Date.now() + 3_600_000).toISOString(),
      }),
    );
    const done = await asTenant(() => tasks.complete(task.id, "Reached the client"));
    expect(done.completedAt).not.toBeNull();
    expect(done.result).toBe("Reached the client");
  });

  it("stage delete is refused if cards remain", async () => {
    // stageNewId still has cards from earlier tests.
    await expect(asTenant(() => pipelines.deleteStage(stageNewId))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("stage type enum values match shared StageType", () => {
    expect(StageType.NORMAL).toBe("NORMAL");
    expect(StageType.WON).toBe("WON");
    expect(StageType.LOST).toBe("LOST");
  });
});
