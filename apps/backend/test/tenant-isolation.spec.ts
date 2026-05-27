import "reflect-metadata";
import { Test, TestingModule } from "@nestjs/testing";
import { ClsModule, ClsService } from "nestjs-cls";
import { UserRole } from "@acoustic-crm/shared";
import { PrismaService } from "../src/modules/prisma/prisma.service";
import { writeContext } from "../src/common/tenant-context";

/**
 * Proves the multi-tenant invariant: a request scoped to tenant A cannot
 * read, update, or delete data belonging to tenant B. The Prisma client
 * extension auto-injects tenantId into every where clause; this test exists
 * because that invariant is the most security-critical guarantee we make.
 */
describe("Multi-tenant isolation", () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let cls: ClsService;

  let tenantAId: string;
  let tenantBId: string;
  let contactAId: string;
  let contactBId: string;

  const runId = `iso-${Date.now()}`;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ClsModule.forRoot({ global: true })],
      providers: [PrismaService],
    }).compile();

    cls = moduleRef.get(ClsService);
    prisma = moduleRef.get(PrismaService);
    await prisma.$connect();

    // Cross-tenant setup via the BASE client (no extension), simulating a
    // SUPER_ADMIN bootstrap.
    const tA = await prisma.tenant.create({
      data: { name: `${runId}-A`, status: "ACTIVE" },
    });
    const tB = await prisma.tenant.create({
      data: { name: `${runId}-B`, status: "ACTIVE" },
    });
    tenantAId = tA.id;
    tenantBId = tB.id;

    const cA = await prisma.contact.create({
      data: { tenantId: tA.id, fullName: "Alice in A", phones: ["+998111111111"] },
    });
    const cB = await prisma.contact.create({
      data: { tenantId: tB.id, fullName: "Bob in B", phones: ["+998222222222"] },
    });
    contactAId = cA.id;
    contactBId = cB.id;
  });

  afterAll(async () => {
    await prisma.contact.deleteMany({
      where: { id: { in: [contactAId, contactBId] } },
    });
    await prisma.tenant.deleteMany({
      where: { id: { in: [tenantAId, tenantBId] } },
    });
    await prisma.$disconnect();
    await moduleRef.close();
  });

  function asTenant<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
    return cls.run(async () => {
      writeContext(cls, {
        tenantId,
        userId: "test-user",
        role: UserRole.TENANT_ADMIN,
        email: `op@${tenantId}.local`,
        skipTenantFilter: false,
      });
      return fn();
    });
  }

  it("findMany on tenant A returns only A's contacts", async () => {
    const ids = await asTenant(tenantAId, async () => {
      const rows = await prisma.t.contact.findMany();
      return rows.map((r) => r.id);
    });
    expect(ids).toContain(contactAId);
    expect(ids).not.toContain(contactBId);
  });

  it("findFirst by id of B's contact while in A returns null", async () => {
    const found = await asTenant(tenantAId, async () =>
      prisma.t.contact.findFirst({ where: { id: contactBId } }),
    );
    expect(found).toBeNull();
  });

  it("updateMany cannot touch B's contact while in A (affected count = 0)", async () => {
    const { count } = await asTenant(tenantAId, async () =>
      prisma.t.contact.updateMany({
        where: { id: contactBId },
        data: { fullName: "HACKED" },
      }),
    );
    expect(count).toBe(0);

    // And the row is unchanged in tenant B's actual scope.
    const stillBob = await asTenant(tenantBId, async () =>
      prisma.t.contact.findFirst({ where: { id: contactBId } }),
    );
    expect(stillBob?.fullName).toBe("Bob in B");
  });

  it("deleteMany cannot touch B's contact while in A (affected count = 0)", async () => {
    const { count } = await asTenant(tenantAId, async () =>
      prisma.t.contact.deleteMany({ where: { id: contactBId } }),
    );
    expect(count).toBe(0);

    // And the row still exists.
    const stillThere = await asTenant(tenantBId, async () =>
      prisma.t.contact.findFirst({ where: { id: contactBId } }),
    );
    expect(stillThere).not.toBeNull();
  });

  it("create overrides tenantId to current scope (defense-in-depth)", async () => {
    // Service code passes the current tenantId explicitly. Even if a
    // misbehaving caller passed B's tenantId while in A's scope, the
    // extension's spread overwrites it.
    const newContact = await asTenant(tenantAId, async () =>
      prisma.t.contact.create({
        data: {
          tenantId: tenantBId, // intentionally wrong — extension must overwrite
          fullName: "auto-stamped",
          phones: ["+998000000000"],
        },
      }),
    );
    try {
      expect(newContact.tenantId).toBe(tenantAId);
      expect(newContact.tenantId).not.toBe(tenantBId);
    } finally {
      await prisma.contact.delete({ where: { id: newContact.id } });
    }
  });
});
