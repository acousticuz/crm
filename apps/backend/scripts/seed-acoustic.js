/**
 * Acoustic seed (M11). Bootstraps a realistic Acoustic call-center tenant
 * so a fresh deployment can be used end-to-end after `prisma migrate deploy`.
 *
 * Contents created (idempotent — re-run safe):
 *   - Tenant "Acoustic" (with auto-generated webhookSecret in settings)
 *   - 22 branches (Tashkent districts + major regional cities)
 *   - Default pipeline "Sotuv" with 5 stages (Yangi → Bog'lanildi → Taklif → Yutdi/Yo'qotdi)
 *   - 6 sample tags
 *   - QA script "Acoustic standart" with 4 criteria (uz keywords for mock LLM)
 *   - 5 users (tenant-admin, supervisor, 3 operators across branches)
 *
 * Reads ACOUSTIC_TENANT_ADMIN_PASSWORD from env (default: ChangeMe!2026).
 * Output: prints the freshly-generated tenant id + webhook secret + admin email.
 */
const { PrismaClient } = require("@prisma/client");
const argon2 = require("argon2");
const crypto = require("node:crypto");

const TENANT_NAME = "Acoustic";

const BRANCHES = [
  "Chilonzor filiali",
  "Yunusobod filiali",
  "Mirzo Ulug'bek filiali",
  "Yashnobod filiali",
  "Olmazor filiali",
  "Yakkasaroy filiali",
  "Shayxontohur filiali",
  "Sergeli filiali",
  "Bektemir filiali",
  "Uchtepa filiali",
  "Mirobod filiali",
  "Yangihayot filiali",
  "Samarqand filiali",
  "Buxoro filiali",
  "Andijon filiali",
  "Farg'ona filiali",
  "Namangan filiali",
  "Qarshi filiali",
  "Nukus filiali",
  "Termiz filiali",
  "Jizzax filiali",
  "Navoiy filiali",
];

const TAGS = [
  { name: "VIP", color: "#a855f7" },
  { name: "qiziqish_yuqori", color: "#22c55e" },
  { name: "shikoyat", color: "#dc2626" },
  { name: "narx_so'rovi", color: "#0ea5e9" },
  { name: "filial_tashrifi", color: "#16a34a" },
  { name: "qaytarish", color: "#f59e0b" },
];

const PIPELINE = {
  name: "Sotuv",
  isDefault: true,
  stages: [
    { name: "Yangi", order: 0, color: "#0ea5e9", type: "NORMAL" },
    { name: "Bog'lanildi", order: 1, color: "#22c55e", type: "NORMAL" },
    { name: "Taklif yuborildi", order: 2, color: "#f59e0b", type: "NORMAL" },
    { name: "Yutdi", order: 3, color: "#16a34a", type: "WON" },
    { name: "Yo'qotdi", order: 4, color: "#dc2626", type: "LOST" },
  ],
};

const QA_SCRIPT = {
  name: "Acoustic standart",
  sections: ["Salomlashish", "Mijoz ehtiyoji", "Yakunlash"],
  criteria: [
    {
      id: "greeting",
      section: "Salomlashish",
      text: "Operator standart salomlashishni qo'llashi kerak",
      maxScore: 10,
      keywords: ["assalomu alaykum", "xush kelibsiz"],
    },
    {
      id: "needs-discovery",
      section: "Mijoz ehtiyoji",
      text: "Operator mijoz ehtiyojini aniqlashi kerak (savol berishi)",
      maxScore: 25,
      keywords: ["qaysi xizmat", "qiziqtiradi", "ehtiyoj"],
    },
    {
      id: "branch-invite",
      section: "Yakunlash",
      text: "Operator filialga tashrif buyurishni taklif qilishi kerak",
      maxScore: 20,
      keywords: ["filial", "tashrif", "kelishingiz"],
    },
    {
      id: "warm-close",
      section: "Yakunlash",
      text: "Operator iliq tugatish (rahmat) bilan suhbatni yopishi kerak",
      maxScore: 15,
      keywords: ["rahmat", "xayrli kun", "xayrli"],
    },
  ],
};

const USERS = [
  { role: "TENANT_ADMIN", email: "admin@acoustic.uz", fullName: "Acoustic Administrator", branchIdx: null },
  { role: "SUPERVISOR", email: "supervisor@acoustic.uz", fullName: "Bosh Supervayzer", branchIdx: 0 },
  { role: "OPERATOR", email: "operator1@acoustic.uz", fullName: "Aziz Aliyev", branchIdx: 0 },
  { role: "OPERATOR", email: "operator2@acoustic.uz", fullName: "Bekzod Sodiqov", branchIdx: 1 },
  { role: "OPERATOR", email: "operator3@acoustic.uz", fullName: "Dilnoza Karimova", branchIdx: 2 },
];

async function main() {
  const prisma = new PrismaClient();
  try {
    const adminPassword = process.env.ACOUSTIC_TENANT_ADMIN_PASSWORD || "ChangeMe!2026";

    let tenant = await prisma.tenant.findFirst({ where: { name: TENANT_NAME } });
    if (!tenant) {
      const webhookSecret = crypto.randomBytes(24).toString("hex");
      tenant = await prisma.tenant.create({
        data: {
          name: TENANT_NAME,
          status: "ACTIVE",
          defaultLanguage: "uz",
          settings: { webhookSecret },
        },
      });
      console.log(`Created tenant ${tenant.id}`);
      console.log(`  webhookSecret: ${webhookSecret}`);
    } else {
      console.log(`Tenant already exists: ${tenant.id}`);
    }

    // Branches.
    const branches = [];
    for (const name of BRANCHES) {
      const existing = await prisma.branch.findFirst({ where: { tenantId: tenant.id, name } });
      if (existing) {
        branches.push(existing);
        continue;
      }
      const b = await prisma.branch.create({ data: { tenantId: tenant.id, name } });
      branches.push(b);
    }
    console.log(`Branches: ${branches.length}`);

    // Pipeline + stages.
    let pipeline = await prisma.pipeline.findFirst({
      where: { tenantId: tenant.id, name: PIPELINE.name },
    });
    if (!pipeline) {
      pipeline = await prisma.pipeline.create({
        data: {
          tenantId: tenant.id,
          name: PIPELINE.name,
          isDefault: PIPELINE.isDefault,
          order: 0,
        },
      });
      for (const s of PIPELINE.stages) {
        await prisma.stage.create({
          data: { tenantId: tenant.id, pipelineId: pipeline.id, ...s },
        });
      }
      console.log(`Pipeline ${pipeline.id} created with ${PIPELINE.stages.length} stages`);
    } else {
      console.log(`Pipeline already exists: ${pipeline.id}`);
    }

    // Tags.
    for (const t of TAGS) {
      const existing = await prisma.tag.findFirst({ where: { tenantId: tenant.id, name: t.name } });
      if (!existing) {
        await prisma.tag.create({ data: { tenantId: tenant.id, ...t } });
      }
    }
    console.log(`Tags: ${TAGS.length}`);

    // QA Script.
    let script = await prisma.script.findFirst({
      where: { tenantId: tenant.id, name: QA_SCRIPT.name },
    });
    if (!script) {
      script = await prisma.script.create({
        data: {
          tenantId: tenant.id,
          name: QA_SCRIPT.name,
          sections: QA_SCRIPT.sections,
          criteria: QA_SCRIPT.criteria,
          isActive: true,
        },
      });
      console.log(`Script ${script.id} created with ${QA_SCRIPT.criteria.length} criteria`);
    } else {
      console.log(`Script already exists: ${script.id}`);
    }

    // Users.
    const passwordHash = await argon2.hash(adminPassword, { type: argon2.argon2id });
    for (const u of USERS) {
      const existing = await prisma.user.findFirst({ where: { email: u.email } });
      if (existing) continue;
      await prisma.user.create({
        data: {
          tenantId: tenant.id,
          fullName: u.fullName,
          email: u.email,
          passwordHash,
          role: u.role,
          status: "ACTIVE",
          branchId: u.branchIdx !== null ? branches[u.branchIdx].id : null,
        },
      });
      console.log(`User ${u.email} (${u.role}) created`);
    }

    console.log("\n=== Acoustic seed complete ===");
    console.log(`Tenant id: ${tenant.id}`);
    console.log(`Admin: admin@acoustic.uz / ${adminPassword}`);
    console.log("(set ACOUSTIC_TENANT_ADMIN_PASSWORD env to override the seed password)");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("seed-acoustic failed:", err);
  process.exit(1);
});
