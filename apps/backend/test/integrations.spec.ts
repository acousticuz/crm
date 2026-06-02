import "reflect-metadata";
import { Test, TestingModule } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { ClsModule, ClsService } from "nestjs-cls";
import { IntegrationType, IntegrationStatus, UserRole } from "@acoustic-crm/shared";
import { PrismaService } from "../src/modules/prisma/prisma.service";
import { AuditService } from "../src/modules/audit/audit.service";
import { IntegrationsService } from "../src/modules/integrations/integrations.service";
import { encryptSecret, decryptSecret, maskSecret } from "../src/common/crypto";
import { writeContext } from "../src/common/tenant-context";

// ENCRYPTION_KEY must be set before crypto is first used.
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? "test-encryption-key-32-bytes-long!!";

describe("Settings — Integrations (encryption, masking, RBAC, audit)", () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let cls: ClsService;
  let integrations: IntegrationsService;

  let tenantId: string;
  let otherTenantId: string;
  let adminUserId: string;

  const runId = `int-${Date.now()}`;
  const SECRET = "supersecretAMI1234";

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        ClsModule.forRoot({ global: true }),
        EventEmitterModule.forRoot({ wildcard: true }),
      ],
      providers: [PrismaService, AuditService, IntegrationsService],
    }).compile();
    await moduleRef.init();

    cls = moduleRef.get(ClsService);
    prisma = moduleRef.get(PrismaService);
    integrations = moduleRef.get(IntegrationsService);
    await prisma.$connect();

    const t = await prisma.tenant.create({ data: { name: `${runId}-a`, status: "ACTIVE" } });
    tenantId = t.id;
    const t2 = await prisma.tenant.create({ data: { name: `${runId}-b`, status: "ACTIVE" } });
    otherTenantId = t2.id;
    const admin = await prisma.user.create({
      data: {
        tenantId,
        fullName: "Int Admin",
        email: `${runId}-admin@test.local`,
        passwordHash: "x",
        role: "TENANT_ADMIN",
        status: "ACTIVE",
      },
    });
    adminUserId = admin.id;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
    await prisma.integration.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
    await prisma.user.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantId, otherTenantId] } } });
    await prisma.$disconnect();
    await moduleRef.close();
  });

  function asTenant<T>(tid: string, fn: () => Promise<T>): Promise<T> {
    return cls.run(async () => {
      writeContext(cls, {
        tenantId: tid,
        userId: tid === tenantId ? adminUserId : null,
        role: UserRole.TENANT_ADMIN,
        email: "admin@test.local",
        skipTenantFilter: false,
      });
      return fn();
    });
  }

  it("crypto round-trips and masking shows only last 4 chars", () => {
    const cipher = encryptSecret(SECRET);
    expect(cipher).not.toContain(SECRET); // ciphertext doesn't leak plaintext
    expect(cipher.split(":")).toHaveLength(3); // iv:tag:cipher
    expect(decryptSecret(cipher)).toBe(SECRET);
    expect(maskSecret(SECRET)).toBe("••••••1234");
    expect(maskSecret("ab")).toBe("••••");
  });

  it("upsert encrypts secrets at rest — DB row never contains the plaintext", async () => {
    await asTenant(tenantId, () =>
      integrations.upsert(IntegrationType.FREEPBX, {
        config: {
          amiHost: "192.168.20.155",
          amiPort: 5038,
          amiUsername: "acoustic-crm",
          amiSecret: SECRET,
        },
      }),
    );

    // Read the raw DB row (bypassing the service masking).
    const row = await prisma.integration.findFirst({
      where: { tenantId, type: "FREEPBX" },
    });
    const serialized = JSON.stringify(row?.config);
    expect(serialized).not.toContain(SECRET); // encrypted at rest
    expect(serialized).toContain("_encrypted"); // secret moved to encrypted bag
    expect(serialized).toContain("192.168.20.155"); // non-secret stays clear
  });

  it("GET masks the secret in the API response (last 4 only, never plaintext)", async () => {
    const masked = await asTenant(tenantId, () => integrations.get(IntegrationType.FREEPBX));
    const cfg = masked.config as Record<string, unknown>;
    expect(cfg.amiHost).toBe("192.168.20.155");
    expect(cfg.amiSecret).toBe("••••••1234");
    expect(JSON.stringify(masked)).not.toContain(SECRET);
    // Internal-only `_encrypted` bag must NOT leak to the API shape.
    expect(JSON.stringify(masked)).not.toContain("_encrypted");
  });

  it("getDecryptedConfig returns plaintext for backend use only", async () => {
    const cfg = await integrations.getDecryptedConfig(tenantId, IntegrationType.FREEPBX);
    expect(cfg?.amiSecret).toBe(SECRET);
    expect(cfg?.amiHost).toBe("192.168.20.155");
  });

  it("editing non-secret fields with a masked secret keeps the original secret", async () => {
    await asTenant(tenantId, () =>
      integrations.upsert(IntegrationType.FREEPBX, {
        config: {
          amiHost: "10.0.0.5", // changed
          amiPort: 5038,
          amiUsername: "acoustic-crm",
          amiSecret: "••••••1234", // masked → keep existing
        },
      }),
    );
    const cfg = await integrations.getDecryptedConfig(tenantId, IntegrationType.FREEPBX);
    expect(cfg?.amiHost).toBe("10.0.0.5"); // updated
    expect(cfg?.amiSecret).toBe(SECRET); // preserved, not overwritten with mask
  });

  it("audit log records the change WITHOUT the secret value", async () => {
    const audit = await prisma.auditLog.findFirst({
      where: { tenantId, action: "integration.upsert" },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).not.toBeNull();
    const details = JSON.stringify(audit!.details);
    expect(details).not.toContain(SECRET);
    expect(details).not.toContain("amiSecret"); // secret field name excluded from logged fields
    expect(details).toContain("amiHost"); // non-secret field names are fine
  });

  it("rejects unknown config fields", async () => {
    await expect(
      asTenant(tenantId, () =>
        integrations.upsert(IntegrationType.TELEGRAM, {
          config: { botToken: "123:abc", evilField: "x" },
        }),
      ),
    ).rejects.toThrow(/Unknown config field/);
  });

  it("list returns all four integration types, masked", async () => {
    const all = await asTenant(tenantId, () => integrations.list());
    const types = all.map((i) => i.type).sort();
    expect(types).toEqual(["FREEPBX", "INBOX", "SMS", "TELEGRAM"]);
    const freepbx = all.find((i) => i.type === "FREEPBX");
    expect(freepbx?.configured).toBe(true);
    expect((freepbx?.config as Record<string, unknown>).amiSecret).toBe("••••••1234");
  });

  it("disconnect sets status to DISCONNECTED without deleting config", async () => {
    const r = await asTenant(tenantId, () => integrations.disconnect(IntegrationType.FREEPBX));
    expect(r.status).toBe(IntegrationStatus.DISCONNECTED);
    // Config still present (secret preserved).
    const cfg = await integrations.getDecryptedConfig(tenantId, IntegrationType.FREEPBX);
    expect(cfg?.amiSecret).toBe(SECRET);
  });

  it("multi-tenant isolation: tenant B does not see tenant A's integration", async () => {
    const bView = await asTenant(otherTenantId, () => integrations.get(IntegrationType.FREEPBX));
    expect(bView.configured).toBe(false); // B has none
    const aDecryptedFromB = await integrations.getDecryptedConfig(otherTenantId, IntegrationType.FREEPBX);
    expect(aDecryptedFromB).toBeNull();
  });

  it("test on an unconfigured integration throws NotFound; configured test returns a generic result", async () => {
    await expect(
      asTenant(otherTenantId, () => integrations.test(IntegrationType.TELEGRAM)),
    ).rejects.toThrow(/not configured/i);

    // Configure a Telegram bot with a bogus token; test should fail gracefully
    // with a generic message and never expose the token.
    await asTenant(tenantId, () =>
      integrations.upsert(IntegrationType.TELEGRAM, {
        config: { botToken: "000:bogus-token-value", purpose: "supervisor" },
      }),
    );
    const result = await asTenant(tenantId, () => integrations.test(IntegrationType.TELEGRAM));
    expect(typeof result.ok).toBe("boolean");
    expect(result.message).not.toContain("bogus-token-value");
  }, 20000);

  // Regression: the SMS form saves the provider in the row column (not in
  // config), so the decryption path that test() uses MUST inject it back in,
  // otherwise testSms hits the empty-provider branch and reports "Provayder
  // tanlanmagan" even after a successful save.
  it("SMS: provider survives the round-trip from upsert → getDecryptedConfig → test()", async () => {
    await asTenant(tenantId, () =>
      integrations.upsert(IntegrationType.SMS, {
        provider: "eskiz",
        config: { login: "test@test.uz", password: "x", sender: "Acoustic" },
      }),
    );

    const cfg = await integrations.getDecryptedConfig(tenantId, IntegrationType.SMS);
    expect(cfg?.provider).toBe("eskiz");
    expect(cfg?.login).toBe("test@test.uz");
    expect(cfg?.password).toBe("x"); // decrypted for backend use

    // Stub Eskiz so we don't hit the real API. The point of the test is that
    // testSms reaches the provider branch (eskiz) — i.e. it does NOT short-
    // circuit with "Provayder tanlanmagan".
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: { token: "fake-jwt" } }), { status: 200 }),
    );
    try {
      const result = await asTenant(tenantId, () => integrations.test(IntegrationType.SMS));
      expect(result.message).not.toMatch(/Provayder tanlanmagan/);
      expect(result.ok).toBe(true);
    } finally {
      fetchSpy.mockRestore();
    }
  }, 20000);
});
