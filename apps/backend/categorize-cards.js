/**
 * Move every NORMAL-stage card into the right pipeline stage based on the
 * customer journey rules.
 *
 *   Priority (first match wins):
 *     1. card.status = WON         → no change (already in "Sotib oldi")
 *     2. answered + branch + !won  → "Qayta aloqa"
 *     3. answered + !branch        → "Bog'lanildi"
 *     4. branch + !answered        → "Filialga yuborildi"
 *     5. calls + !answered         → "Bog'lanib bo'lmadi"
 *     6. no calls                  → "Yangi" (no change)
 *
 *   answered = at least one ANSWERED call with duration > 0
 *   calls    = at least one Call row (any status)
 *   branch   = card.branchId IS NOT NULL
 *
 *   Idempotent: re-running on already-categorized cards produces the same
 *   stage assignment.
 */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const TENANT_NAME = "Acoustic";
const PIPELINE_DEFAULT = true;

async function main() {
  const tenant = await prisma.tenant.findFirst({ where: { name: TENANT_NAME } });
  if (!tenant) throw new Error(`Tenant ${TENANT_NAME} not found`);

  const pipeline = await prisma.pipeline.findFirst({
    where: { tenantId: tenant.id, isDefault: PIPELINE_DEFAULT, deletedAt: null },
    include: { stages: { where: { deletedAt: null }, orderBy: { order: "asc" } } },
  });
  if (!pipeline) throw new Error("Default pipeline not found");

  // Map stage names → ids.
  const byName = Object.fromEntries(pipeline.stages.map((s) => [s.name, s]));
  const required = [
    "Yangi",
    "Bog'lanildi",
    "Bog'lanib bo'lmadi",
    "Filialga yuborildi",
    "Qayta aloqa",
    "Sotib oldi",
  ];
  for (const name of required) {
    if (!byName[name]) throw new Error(`Missing stage "${name}" in default pipeline`);
  }
  const wonStageId = byName["Sotib oldi"].id;

  // Pull every card in the default pipeline (deleted excluded). We classify
  // every card so re-running normalizes new imports as well.
  const cards = await prisma.card.findMany({
    where: { tenantId: tenant.id, pipelineId: pipeline.id, deletedAt: null },
    select: { id: true, stageId: true, branchId: true, status: true },
  });
  console.log(`Loaded ${cards.length} cards.`);

  // Bulk-compute per-card aggregates with a single SQL — much faster than
  // N round-trips when there are thousands of cards.
  const callAgg = await prisma.$queryRaw`
    SELECT "cardId",
           COUNT(*)::int                                                       AS total_calls,
           SUM(CASE WHEN status = 'ANSWERED' AND duration > 0 THEN 1 ELSE 0 END)::int AS answered_calls
    FROM calls
    WHERE "tenantId" = ${tenant.id} AND "deletedAt" IS NULL
    GROUP BY "cardId"
  `;
  const aggByCard = new Map(callAgg.map((r) => [r.cardId, r]));
  console.log(`Aggregated calls for ${aggByCard.size} cards.`);

  const counts = {
    "Sotib oldi": 0,
    "Qayta aloqa": 0,
    "Bog'lanildi": 0,
    "Filialga yuborildi": 0,
    "Bog'lanib bo'lmadi": 0,
    Yangi: 0,
    "Yo'qotdi": 0,
    skipped_won: 0,
    skipped_lost: 0,
    unchanged: 0,
  };

  const updates = [];
  for (const card of cards) {
    let targetName;
    if (card.status === "WON") {
      counts.skipped_won += 1;
      continue;
    }
    if (card.status === "LOST") {
      counts.skipped_lost += 1;
      continue;
    }

    const agg = aggByCard.get(card.id) ?? { total_calls: 0, answered_calls: 0 };
    const hasAnswered = agg.answered_calls > 0;
    const hasCalls = agg.total_calls > 0;
    const hasBranch = card.branchId != null;

    if (hasAnswered && hasBranch) targetName = "Qayta aloqa";
    else if (hasAnswered) targetName = "Bog'lanildi";
    else if (hasBranch) targetName = "Filialga yuborildi";
    else if (hasCalls) targetName = "Bog'lanib bo'lmadi";
    else targetName = "Yangi";

    counts[targetName] += 1;

    const targetStageId = byName[targetName].id;
    if (targetStageId === card.stageId) {
      counts.unchanged += 1;
      continue;
    }
    updates.push({ id: card.id, stageId: targetStageId });
  }

  console.log(`Planned updates: ${updates.length}.`);

  // Batch the updates so we don't hold a giant transaction.
  const BATCH = 100;
  for (let i = 0; i < updates.length; i += BATCH) {
    const batch = updates.slice(i, i + BATCH);
    await prisma.$transaction(
      batch.map((u) =>
        prisma.card.update({
          where: { id: u.id },
          data: { stageId: u.stageId, enteredStageAt: new Date() },
        }),
      ),
    );
    if ((i / BATCH) % 5 === 0) {
      console.log(`  …updated ${Math.min(i + BATCH, updates.length)}/${updates.length}`);
    }
  }

  console.log("");
  console.log("===== DONE =====");
  for (const [k, v] of Object.entries(counts)) {
    console.log(`  ${k.padEnd(22)}: ${v}`);
  }
}

main()
  .catch((err) => { console.error("ERROR:", err); process.exit(1); })
  .finally(() => prisma.$disconnect());
