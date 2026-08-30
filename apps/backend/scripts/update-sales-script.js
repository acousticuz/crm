/**
 * Surgical updater for the Acoustic SALES_SCRIPT.
 *
 * The full `seed-acoustic.js` is destructive in production: it resets every
 * Acoustic user's password to the env default. This script touches ONLY the
 * `Sotuv skripti (Acoustic eshitish apparatlari)` script row — refreshing
 * sections + criteria from the seed source. Safe to re-run.
 *
 *   node apps/backend/scripts/update-sales-script.js
 *
 * The script reads SALES_SCRIPT from seed-acoustic.js so the seed file stays
 * the single source of truth. seed-acoustic.js's entrypoint is guarded with
 * require.main === module, so importing it here is a no-op beyond loading
 * constants.
 */

const path = require("node:path");
const { PrismaClient } = require("@prisma/client");

const { SALES_SCRIPT } = require("./seed-acoustic.js");
const TENANT_NAME = "Acoustic";

async function main() {
  const prisma = new PrismaClient();
  try {
    const tenant = await prisma.tenant.findFirst({ where: { name: TENANT_NAME } });
    if (!tenant) {
      console.error(`Tenant "${TENANT_NAME}" not found. Aborting.`);
      process.exitCode = 1;
      return;
    }

    const existing = await prisma.script.findFirst({
      where: { tenantId: tenant.id, name: SALES_SCRIPT.name },
    });

    if (!existing) {
      // Cold start: the script row doesn't exist yet. Create it.
      const created = await prisma.script.create({
        data: {
          tenantId: tenant.id,
          name: SALES_SCRIPT.name,
          sections: SALES_SCRIPT.sections,
          criteria: SALES_SCRIPT.criteria,
          isActive: true,
        },
      });
      console.log(
        `Sales script "${SALES_SCRIPT.name}" created (${created.id}) with ${SALES_SCRIPT.criteria.length} criteria.`,
      );
    } else {
      // Refresh sections + criteria so the new wording propagates. Don't
      // touch isActive — admins control that toggle.
      await prisma.script.update({
        where: { id: existing.id },
        data: {
          sections: SALES_SCRIPT.sections,
          criteria: SALES_SCRIPT.criteria,
        },
      });
      console.log(
        `Sales script "${SALES_SCRIPT.name}" refreshed (${existing.id}) — ${SALES_SCRIPT.sections.length} sections, ${SALES_SCRIPT.criteria.length} criteria.`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
