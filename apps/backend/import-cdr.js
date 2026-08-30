/**
 * Backfill imports FreePBX CDR rows from June 2026 into the CRM.
 *
 * Strategy
 *  - Group CDR rows by `linkedid` (one logical call may have many legs).
 *  - For each linkedid, derive a single Call:
 *      direction  ← in-s-* recording / dcontext / number length
 *      status     ← best of {ANSWERED > BUSY > MISSED > FAILED}
 *      duration   ← max billsec across legs
 *      from/to    ← caller / DID (or extension)
 *      recordingUrl ← first non-empty recordingfile (relative path)
 *  - Idempotent: skips a linkedid if a Call already exists in
 *    @@unique(tenantId, cdrUniqueId).
 *  - Auto-creates Contact + Card so the imported calls show up in Kanban.
 *
 * Usage
 *   cd /srv/acoustic-crm/apps/backend
 *   node import-cdr.js [from=2026-06-01] [to=2026-07-01]
 *
 * Requires `mysql2` (installed alongside, doesn't pollute the prod tree).
 */
const path = require("node:path");
process.chdir(path.resolve(__dirname));

const argv = require("node:process").argv.slice(2);
const FROM = argv.find((a) => a.startsWith("from="))?.slice(5) ?? "2026-06-01";
const TO   = argv.find((a) => a.startsWith("to="))?.slice(3)   ?? "2026-07-01";

const mysql = require("mysql2/promise");
const { PrismaClient } = require("@prisma/client");

const TENANT_NAME = "Acoustic";
const BATCH_SIZE = 50;

// E.164-ish normalization for Uzbek numbers. CDR usually drops the +998
// prefix on local-format dials; we put it back. Extensions stay digits-only
// (caller never expects to call back an extension, so they don't pollute
// the Contact table).
function normalizePhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");
  if (!digits || digits.length < 5) return null;          // too short — likely an extension
  if (digits.length === 9 && digits.startsWith("9")) return "+998" + digits; // 9XXxxxxxxxx mobile
  if (digits.length === 9 && digits.startsWith("7")) return "+998" + digits; // 71XXXXXXX Toshkent landline
  if (digits.length === 12 && digits.startsWith("998")) return "+" + digits;
  if (digits.length === 13 && digits[0] === "+") return digits;
  if (digits.length > 10) return "+" + digits;            // international, leave the rest alone
  return null;
}

function isExtension(raw) {
  if (!raw) return false;
  const digits = String(raw).replace(/\D/g, "");
  return digits.length > 0 && digits.length <= 4;
}

const STATUS_RANK = { ANSWERED: 4, BUSY: 3, MISSED: 2, FAILED: 1, RINGING: 0 };
function bestStatus(legs) {
  let best = "FAILED";
  for (const l of legs) {
    let s;
    switch ((l.disposition || "").toUpperCase()) {
      case "ANSWERED": s = "ANSWERED"; break;
      case "NO ANSWER": s = "MISSED"; break;
      case "BUSY": s = "BUSY"; break;
      case "FAILED": s = "FAILED"; break;
      default: s = "FAILED";
    }
    if (STATUS_RANK[s] > STATUS_RANK[best]) best = s;
  }
  return best;
}

function deriveDirection(legs) {
  // Recording-file naming is the strongest signal Asterisk gives us.
  for (const l of legs) {
    const f = l.recordingfile || "";
    if (f.startsWith("in-")) return "INBOUND";
    if (f.startsWith("out-")) return "OUTBOUND";
  }
  // Fallback: look at the entry leg's dcontext + caller length.
  const entry = legs[0];
  if (entry.dcontext === "from-internal" && isExtension(entry.src)) return "OUTBOUND";
  if (!isExtension(entry.src)) return "INBOUND";
  return "INBOUND";
}

function deriveFromTo(legs, direction) {
  // Pick the leg with the most "external-looking" identity for the public
  // side; the internal side is whatever extension was on the other end.
  let fromRaw = legs[0].src;
  let toRaw = legs[0].did || legs[0].dst;
  for (const l of legs) {
    if (direction === "INBOUND" && !isExtension(l.src) && fromRaw !== l.src) fromRaw = l.src;
    if (l.did) toRaw = l.did;
  }
  const from = normalizePhone(fromRaw) || String(fromRaw || "");
  const to = normalizePhone(toRaw) || String(toRaw || "");
  return { fromNumber: from, toNumber: to };
}

async function main() {
  // 1) Connections
  const my = await mysql.createConnection({
    host: "127.0.0.1",
    port: 3306,
    user: "acoustic_ro",
    password: process.env.CDR_MYSQL_PASSWORD,
    database: "asteriskcdrdb",
    ssl: false,
  });
  const prisma = new PrismaClient();

  const tenant = await prisma.tenant.findFirst({ where: { name: TENANT_NAME } });
  if (!tenant) throw new Error(`Tenant "${TENANT_NAME}" not found`);
  const pipeline = await prisma.pipeline.findFirst({
    where: { tenantId: tenant.id, isDefault: true, deletedAt: null },
    include: { stages: { orderBy: { order: "asc" }, where: { deletedAt: null } } },
  });
  if (!pipeline || !pipeline.stages.length) {
    throw new Error("Default pipeline / first stage not found — re-run seed first.");
  }
  const firstStage = pipeline.stages[0];
  console.log(`Tenant ${tenant.id} · Pipeline ${pipeline.id} · Stage "${firstStage.name}"`);

  // 2) Pull every linkedid in the date range. The CDR table is large but the
  //    DISTINCT keeps the working set small (1k–10k per month).
  const [ids] = await my.query(
    `SELECT DISTINCT linkedid FROM cdr
     WHERE calldate >= ? AND calldate < ?
       AND linkedid != ''
     ORDER BY linkedid`,
    [FROM, TO],
  );
  console.log(`Found ${ids.length} unique linkedid(s) in [${FROM}, ${TO}).`);

  // 3) Pre-load already-imported cdrUniqueIds so we skip them in O(1).
  const existing = await prisma.call.findMany({
    where: { tenantId: tenant.id, cdrUniqueId: { in: ids.map((r) => r.linkedid) } },
    select: { cdrUniqueId: true },
  });
  const seen = new Set(existing.map((c) => c.cdrUniqueId));
  console.log(`${seen.size} already imported (will skip).`);

  // 4) Process each linkedid one by one. ~1300 rows in June → fine to keep
  //    serial; protects FreePBX MySQL from hammering.
  let created = 0;
  let skipped = 0;
  let contactsCreated = 0;
  let cardsCreated = 0;

  for (let i = 0; i < ids.length; i += 1) {
    const linkedid = ids[i].linkedid;
    if (seen.has(linkedid)) { skipped += 1; continue; }

    const [legs] = await my.query(
      `SELECT calldate, clid, src, dst, dcontext, channel, duration, billsec,
              disposition, uniqueid, did, recordingfile
       FROM cdr WHERE linkedid = ?
       ORDER BY calldate, sequence`,
      [linkedid],
    );
    if (!legs.length) continue;

    const direction = deriveDirection(legs);
    const status = bestStatus(legs);
    const { fromNumber, toNumber } = deriveFromTo(legs, direction);
    const startedAt = legs[0].calldate;
    const maxBillsec = legs.reduce((m, l) => Math.max(m, l.billsec || 0), 0);
    const maxDuration = legs.reduce((m, l) => Math.max(m, l.duration || 0), 0);
    const duration = maxBillsec || maxDuration;
    const recordingfile = legs.find((l) => l.recordingfile)?.recordingfile || null;
    const recordingUrl = recordingfile
      ? `/var/spool/asterisk/monitor/${recordingfile}` // relative on FreePBX disk; CRM resolves later
      : null;
    const externalPhone = direction === "INBOUND" ? fromNumber : toNumber;

    // Skip rows whose external party is just an internal extension — nothing
    // to attribute the call to in CRM.
    if (!externalPhone || isExtension(externalPhone.replace(/\D/g, ""))) {
      skipped += 1;
      continue;
    }

    // 4a) Contact upsert by normalized phone.
    let contact = await prisma.contact.findFirst({
      where: { tenantId: tenant.id, phones: { has: externalPhone }, deletedAt: null },
    });
    if (!contact) {
      contact = await prisma.contact.create({
        data: {
          tenantId: tenant.id,
          fullName: "Noma'lum",
          phones: [externalPhone],
          source: "freepbx-cdr",
        },
      });
      contactsCreated += 1;
    }

    // 4b) Card — at most one open card per contact in the default pipeline.
    let card = await prisma.card.findFirst({
      where: {
        tenantId: tenant.id,
        contactId: contact.id,
        pipelineId: pipeline.id,
        deletedAt: null,
      },
      orderBy: { createdAt: "desc" },
    });
    if (!card) {
      card = await prisma.card.create({
        data: {
          tenantId: tenant.id,
          contactId: contact.id,
          pipelineId: pipeline.id,
          stageId: firstStage.id,
          title: contact.fullName + " (" + externalPhone + ")",
          status: "OPEN",
          enteredStageAt: startedAt,
        },
      });
      cardsCreated += 1;
    }

    // 4c) Call.
    await prisma.call.create({
      data: {
        tenantId: tenant.id,
        contactId: contact.id,
        cardId: card.id,
        direction,
        status,
        fromNumber: fromNumber || "",
        toNumber: toNumber || "",
        startedAt,
        endedAt: duration ? new Date(new Date(startedAt).getTime() + duration * 1000) : null,
        duration,
        recordingUrl,
        cdrUniqueId: linkedid,
      },
    });
    created += 1;

    if (created % 50 === 0) {
      console.log(`  …${created} imported, ${skipped} skipped (at ${i + 1}/${ids.length})`);
    }
  }

  console.log("");
  console.log("===== DONE =====");
  console.log(`Calls created     : ${created}`);
  console.log(`Skipped (existing): ${skipped}`);
  console.log(`Contacts created  : ${contactsCreated}`);
  console.log(`Cards created     : ${cardsCreated}`);

  await my.end();
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("import failed:", err);
  process.exitCode = 1;
});
