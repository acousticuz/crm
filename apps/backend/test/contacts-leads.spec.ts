import "reflect-metadata";
import { Test, TestingModule } from "@nestjs/testing";
import { ConflictException, BadRequestException } from "@nestjs/common";
import { ClsModule, ClsService } from "nestjs-cls";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { UserRole, LeadStatus } from "@acoustic-crm/shared";
import { PrismaService } from "../src/modules/prisma/prisma.service";
import { ContactsService } from "../src/modules/contacts/contacts.service";
import { LeadsService } from "../src/modules/leads/leads.service";
import { writeContext } from "../src/common/tenant-context";
import { normalizePhone } from "../src/common/phone";

describe("M2 — Contacts + Leads", () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let cls: ClsService;
  let contacts: ContactsService;
  let leads: LeadsService;

  let tenantId: string;
  let pipelineId: string;
  let stageId: string;

  const runId = `m2-${Date.now()}`;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ClsModule.forRoot({ global: true }),
        EventEmitterModule.forRoot({ wildcard: true }),
      ],
      providers: [PrismaService, ContactsService, LeadsService],
    }).compile();

    cls = moduleRef.get(ClsService);
    prisma = moduleRef.get(PrismaService);
    contacts = moduleRef.get(ContactsService);
    leads = moduleRef.get(LeadsService);
    await prisma.$connect();

    // Bootstrap a tenant with a default pipeline + stage (mimics what
    // TenantsService.createWithAdmin builds for a real tenant).
    const t = await prisma.tenant.create({
      data: { name: `${runId}-tenant`, status: "ACTIVE" },
    });
    tenantId = t.id;
    const pipeline = await prisma.pipeline.create({
      data: { tenantId, name: "Sotuv", isDefault: true, order: 0 },
    });
    pipelineId = pipeline.id;
    const stage = await prisma.stage.create({
      data: {
        tenantId,
        pipelineId,
        name: "Yangi",
        order: 0,
        color: "#0ea5e9",
        type: "NORMAL",
      },
    });
    stageId = stage.id;
  });

  afterAll(async () => {
    // Clean in dependency order.
    await prisma.lead.deleteMany({ where: { tenantId } });
    await prisma.card.deleteMany({ where: { tenantId } });
    await prisma.contact.deleteMany({ where: { tenantId } });
    await prisma.stage.deleteMany({ where: { tenantId } });
    await prisma.pipeline.deleteMany({ where: { tenantId } });
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
        email: "admin@test.local",
        skipTenantFilter: false,
      });
      return fn();
    });
  }

  it("normalizes Uzbek phone variants to a canonical +998 form", () => {
    expect(normalizePhone("+998 90 123 45 67")).toBe("+998901234567");
    expect(normalizePhone("998 90-123-45-67")).toBe("+998901234567");
    expect(normalizePhone("90 123 45 67")).toBe("+998901234567");
    expect(normalizePhone("+1 555 1234")).toBe("+15551234");
  });

  it("creates a contact and rejects duplicates by overlapping phone", async () => {
    const phone = "+998901112233";
    const created = await asTenant(() =>
      contacts.create({ fullName: "Aziz Aliyev", phones: [phone] }),
    );
    expect(created.id).toBeDefined();
    expect(created.phones).toContain(phone);

    // Same phone, different name → conflict.
    await expect(
      asTenant(() => contacts.create({ fullName: "Duplicate", phones: [phone] })),
    ).rejects.toBeInstanceOf(ConflictException);

    // Different phone variant that normalizes to the same number → still conflict.
    await expect(
      asTenant(() =>
        contacts.create({ fullName: "Same number, formatted differently", phones: ["998 90 111 22 33"] }),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("search by name and by phone returns the contact", async () => {
    const byName = await asTenant(() => contacts.list({ q: "Aziz" }));
    expect(byName.items.find((c) => c.fullName === "Aziz Aliyev")).toBeTruthy();

    const byPhone = await asTenant(() => contacts.list({ q: "+998901112233" }));
    expect(byPhone.items.find((c) => c.phones.includes("+998901112233"))).toBeTruthy();
  });

  it("ingests a webhook lead as UNSORTED with source preserved", async () => {
    const lead = await asTenant(() =>
      leads.createFromWebhook(
        "website",
        { fullName: "Webhook Person", phone: "+998901234500" },
        { fullName: "Webhook Person", phone: "+998901234500", utm_source: "fb" },
      ),
    );
    expect(lead.status).toBe(LeadStatus.UNSORTED);
    expect(lead.source).toBe("website");
    const raw = lead.rawData as Record<string, unknown>;
    expect(raw.utm_source).toBe("fb");
  });

  it("accept creates a Card linked to a (new) Contact and marks the lead ACCEPTED", async () => {
    const lead = await asTenant(() =>
      leads.createFromWebhook(
        "facebook",
        { fullName: "Bekzod L", phone: "+998935550000" },
        { fullName: "Bekzod L", phone: "+998935550000" },
      ),
    );
    const result = await asTenant(() => leads.accept(lead.id));
    expect(result.cardId).toBeDefined();
    expect(result.contactId).toBeDefined();

    const card = await asTenant(() =>
      prisma.t.card.findFirst({ where: { id: result.cardId } }),
    );
    expect(card?.pipelineId).toBe(pipelineId);
    expect(card?.stageId).toBe(stageId);
    expect(card?.contactId).toBe(result.contactId);

    const refreshed = await asTenant(() =>
      prisma.t.lead.findFirst({ where: { id: lead.id } }),
    );
    expect(refreshed?.status).toBe(LeadStatus.ACCEPTED);
    expect(refreshed?.cardId).toBe(result.cardId);
  });

  it("accept twice on the same lead is rejected", async () => {
    const lead = await asTenant(() =>
      leads.createFromWebhook(
        "instagram",
        { fullName: "Twice", phone: "+998936660000" },
        { fullName: "Twice", phone: "+998936660000" },
      ),
    );
    await asTenant(() => leads.accept(lead.id));
    await expect(asTenant(() => leads.accept(lead.id))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("reject marks the lead REJECTED and blocks subsequent accept", async () => {
    const lead = await asTenant(() =>
      leads.createFromWebhook(
        "website",
        { fullName: "To Reject", phone: "+998937770000" },
        { fullName: "To Reject", phone: "+998937770000" },
      ),
    );
    const r = await asTenant(() => leads.reject(lead.id));
    expect(r.status).toBe(LeadStatus.REJECTED);
    await expect(asTenant(() => leads.accept(lead.id))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("accept reuses an existing contact when the phone already matches", async () => {
    const phone = "+998938880000";
    const existing = await asTenant(() =>
      contacts.create({ fullName: "Existing", phones: [phone] }),
    );
    const lead = await asTenant(() =>
      leads.createFromWebhook(
        "website",
        { fullName: "Different Name Same Phone", phone },
        { fullName: "Different Name Same Phone", phone },
      ),
    );
    const result = await asTenant(() => leads.accept(lead.id));
    expect(result.contactId).toBe(existing.id);
  });
});
