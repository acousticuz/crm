import "reflect-metadata";
import { Test, TestingModule } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { ClsModule, ClsService } from "nestjs-cls";
import { UserRole } from "@acoustic-crm/shared";
import { PrismaService } from "../src/modules/prisma/prisma.service";
import { AuditService } from "../src/modules/audit/audit.service";
import { RealtimeService } from "../src/modules/realtime/realtime.service";
import { IntegrationsService } from "../src/modules/integrations/integrations.service";
import { CallsService } from "../src/modules/calls/calls.service";
import { UsersService } from "../src/modules/users/users.service";
import { writeContext } from "../src/common/tenant-context";

describe("UsersService.importFromPbx — provision operators from FreePBX", () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let cls: ClsService;
  let users: UsersService;

  let tenantId: string;
  let adminId: string;

  const runId = `imp-${Date.now()}`;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        ClsModule.forRoot({ global: true }),
        EventEmitterModule.forRoot({ wildcard: true }),
      ],
      providers: [
        PrismaService,
        AuditService,
        RealtimeService,
        IntegrationsService,
        CallsService,
        UsersService,
      ],
    }).compile();
    await moduleRef.init();

    cls = moduleRef.get(ClsService);
    prisma = moduleRef.get(PrismaService);
    users = moduleRef.get(UsersService);
    await prisma.$connect();

    const t = await prisma.tenant.create({ data: { name: `${runId} Co`, status: "ACTIVE" } });
    tenantId = t.id;
    const admin = await prisma.user.create({
      data: {
        tenantId,
        fullName: "Imp Admin",
        email: `${runId}-admin@test.local`,
        passwordHash: "x",
        role: "TENANT_ADMIN",
        status: "ACTIVE",
      },
    });
    adminId = admin.id;
    // An operator already mapped to 2000 — import must skip it.
    await prisma.user.create({
      data: {
        tenantId,
        fullName: "Existing 2000",
        email: `${runId}-2000@test.local`,
        passwordHash: "x",
        role: "OPERATOR",
        extension: "2000",
        status: "ACTIVE",
      },
    });
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
    await moduleRef.close();
  });

  function asTenant<T>(fn: () => Promise<T>): Promise<T> {
    return cls.run(async () => {
      writeContext(cls, {
        tenantId,
        userId: adminId,
        role: UserRole.TENANT_ADMIN,
        email: "admin@test.local",
        skipTenantFilter: false,
      });
      return fn();
    });
  }

  it("creates operators for new numeric extensions, skips existing and trunks", async () => {
    // Mock the PBX extension list (worker proxy) — 2000 exists, 2001/2002 new,
    // "Uztelecom" is a trunk and must be skipped.
    const fetchSpy = jest
      .spyOn(global, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ extensions: ["2000", "2001", "2002", "Uztelecom"] }), {
          status: 200,
        }),
      );
    try {
      const result = await asTenant(() => users.importFromPbx());

      const createdExts = result.created.map((c) => c.extension).sort();
      expect(createdExts).toEqual(["2001", "2002"]);
      expect(result.skippedExisting).toContain("2000");
      expect(result.skippedNonNumeric).toContain("Uztelecom");

      // Each created account has a generated email + non-empty temp password.
      for (const c of result.created) {
        expect(c.email).toMatch(/@/);
        expect(c.tempPassword.length).toBeGreaterThanOrEqual(8);
      }

      // The new operators are persisted with the right role + extension.
      const op2001 = await prisma.user.findFirst({ where: { tenantId, extension: "2001" } });
      expect(op2001).not.toBeNull();
      expect(op2001!.role).toBe("OPERATOR");
      expect(op2001!.fullName).toBe("Operator 2001");

      // Only one user owns extension 2000 (the pre-existing one) — no duplicate.
      const owners2000 = await prisma.user.count({ where: { tenantId, extension: "2000" } });
      expect(owners2000).toBe(1);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("is idempotent — a second import creates nothing new", async () => {
    const fetchSpy = jest
      .spyOn(global, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ extensions: ["2000", "2001", "2002"] }), { status: 200 }),
      );
    try {
      const result = await asTenant(() => users.importFromPbx());
      expect(result.created).toHaveLength(0);
      expect(result.skippedExisting.sort()).toEqual(["2000", "2001", "2002"]);
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
