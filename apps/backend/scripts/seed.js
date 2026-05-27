/**
 * Idempotent seed: ensures a "System" tenant and a SUPER_ADMIN user exist so
 * /api/v1/tenants can be called to bootstrap real tenants.
 *
 * Reads SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD from env. Defaults are
 * local-dev only (DECISIONS.md §12).
 *
 * Plain JS so we don't pay the ts-node tsconfig dance for a one-shot script.
 */
const { PrismaClient } = require("@prisma/client");
const argon2 = require("argon2");

const SYSTEM_TENANT_NAME = "__system__";

async function main() {
  const prisma = new PrismaClient();
  try {
    const email = process.env.SUPERADMIN_EMAIL || "admin@acoustic.local";
    const password = process.env.SUPERADMIN_PASSWORD || "ChangeMe!2026";

    let tenant = await prisma.tenant.findFirst({
      where: { name: SYSTEM_TENANT_NAME },
    });
    if (!tenant) {
      tenant = await prisma.tenant.create({
        data: {
          name: SYSTEM_TENANT_NAME,
          status: "ACTIVE",
          defaultLanguage: "uz",
          settings: { internal: true },
        },
      });
      console.log(`Created system tenant ${tenant.id}`);
    }

    const existing = await prisma.user.findFirst({ where: { email } });
    if (existing) {
      console.log(`Super-admin ${email} already exists (id=${existing.id})`);
      return;
    }

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const admin = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        fullName: "System Super Admin",
        email,
        passwordHash,
        role: "SUPER_ADMIN",
        status: "ACTIVE",
      },
    });
    console.log(`Created super-admin ${admin.email} (id=${admin.id})`);
    console.log("Login with password from SUPERADMIN_PASSWORD env (default: ChangeMe!2026)");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
