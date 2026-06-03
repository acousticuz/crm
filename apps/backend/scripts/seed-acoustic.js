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

// (Seed used to ship a sample set of tags — VIP, qiziqish_yuqori, shikoyat,
// narx_so'rovi, filial_tashrifi, qaytarish — but it was opinionated noise
// for most tenants. The seed no longer creates them; tenant admins build
// their own taxonomy from Settings → Teglar. Existing rows were removed by
// migration 20260603130000_eskiz_token_cache_clear_seed_tags.)

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

// Operator-facing sales script — shown in the top app bar so operators can
// follow each step during the call. Sections are also the QA criteria, so
// supervisor scoring stays anchored to the same wording the operators see.
// Total maxScore = 100.
const SALES_SCRIPT = {
  name: "Sotuv skripti (Acoustic eshitish apparatlari)",
  sections: [
    "Salomlashish va tanishtirish",
    "Ehtiyojni aniqlash",
    "Bepul eshitish tekshiruvini taklif qilish",
    "Mahsulot/xizmat haqida ma'lumot",
    "E'tiroz bilan ishlash",
    "Keyingi qadamni belgilash",
    "Xayrlashish",
  ],
  criteria: [
    {
      id: "salomlashish",
      section: "Salomlashish va tanishtirish",
      text:
        "Operator o'zini va Acoustic eshitish markazini tanishtiradi, mijozning ismini so'raydi.",
      maxScore: 10,
      keywords: ["assalomu alaykum", "acoustic", "ismingiz", "tanishtiraman"],
      guidance: [
        "\"Assalomu alaykum, men Acoustic eshitish markazidan {operator_ismi}.\"",
        "\"Iltimos, sizning ismingizni bilsam bo'ladimi?\"",
        "Sokin, do'stona ohang. Mijoz ismini eslab qoling va davomida ishlatib turing.",
      ],
    },
    {
      id: "ehtiyojni-aniqlash",
      section: "Ehtiyojni aniqlash",
      text:
        "Eshitish muammosi qachondan beri, qaysi vaziyatlarda qiynaladi, avval tekshiruvdan o'tganmi — ochiq savollar bilan aniqlanadi.",
      maxScore: 20,
      keywords: ["qachondan", "qiyin", "tekshiruv", "qaysi vaziyat"],
      guidance: [
        "Ochiq savollar bering: \"Qachondan beri eshitishda muammo sezayotgansiz?\"",
        "\"Qaysi vaziyatlarda ko'proq qiynalasiz — gaplashganda, televizor ko'rganda, yig'ilishlarda?\"",
        "\"Avval qayerdadir audiometriyadan o'tganmisiz? Apparatdan foydalanganmisiz?\"",
        "Mijozning gapini bo'lmasdan tinglang, kalit so'zlarni yozib oling.",
      ],
    },
    {
      id: "bepul-tekshiruv",
      section: "Bepul eshitish tekshiruvini taklif qilish",
      text:
        "Mijozga yaqin filialdagi bepul audiometriya tekshiruvini taklif qiling — aniq manzil va vaqt aytib.",
      maxScore: 15,
      keywords: ["bepul tekshiruv", "audiometriya", "filial", "tashrif"],
      guidance: [
        "\"Sizga yaqin filialimizda audiometriya tekshiruvi BEPUL — bu bizning yangi mijozlarga taklifimiz.\"",
        "Yaqin filialni ayting (manzil + ish vaqti). Masalan: \"Chilonzor filialimiz, Bunyodkor 12, har kuni 9:00–18:00.\"",
        "Aniq vaqt taklif qiling: \"Ertaga soat 11:00 ga yozaman, sizga qulaymi?\"",
      ],
    },
    {
      id: "mahsulot-malumoti",
      section: "Mahsulot/xizmat haqida ma'lumot",
      text:
        "Apparat turlari, afzalliklari va mijoz ehtiyojiga moslab qisqacha tushuntiriladi.",
      maxScore: 20,
      keywords: ["apparat", "model", "afzallik", "ehtiyoj"],
      guidance: [
        "Mijoz ehtiyojiga MOS apparat turini ko'rsating (quloq ichi/orqasi, raqamli, akkumulyatorli).",
        "2-3 ta asosiy afzallikni ayting: shovqinni filtirlash, ko'rinmas dizayn, smartfon bilan ulanish.",
        "Texnik jargon ishlatmang; oddiy tilda tushuntiring.",
        "Mahsulot narxi haqida hozir aniq raqam BERMASDAN, filialda tekshiruvdan keyin tanlash haqida ayting.",
      ],
    },
    {
      id: "etiroz",
      section: "E'tiroz bilan ishlash",
      text:
        "\"Narxi qimmat\", \"O'ylab ko'raman\", \"Ishonmayman\" e'tirozlariga to'g'ri va xushmuomalalik bilan javob beriladi.",
      maxScore: 15,
      keywords: ["narx", "ishonch", "o'ylab", "kafolat"],
      guidance: [
        "\"Qimmat\" → \"Tushunaman. Lekin apparatimiz 2 yil kafolatli va imkoniyatlar moslamasi bor.\"",
        "\"O'ylab ko'raman\" → \"Albatta. Bepul tekshiruvga yozilib qo'ying, qaror keyin qabul qilasiz.\"",
        "\"Ishonmayman\" → \"Mingdan ortiq mijozimiz bor. Filial tashrifi paytida ko'rsatamiz.\"",
        "Bahslashmang, mijozni eshiting va xulosa qiling.",
      ],
    },
    {
      id: "keyingi-qadam",
      section: "Keyingi qadamni belgilash",
      text:
        "Aniq sana/vaqtga tekshiruv yoki tashrif belgilang; qayta aloqa qilishni va'da qiling.",
      maxScore: 15,
      keywords: ["yozdim", "kelishuv", "qayta aloqa", "sms"],
      guidance: [
        "Aniq vaqt va sana yozib oling: \"Sizga 5-iyun, soat 11:00 ga yozib qo'ydim.\"",
        "Mijoz raqamiga SMS tasdiqlovi yuborilishini ayting.",
        "Tashrifgacha telefonda eslatma qilinishini ayting.",
      ],
    },
    {
      id: "xayrlashish",
      section: "Xayrlashish",
      text: "Suhbatni samimiy, professional xulosa va minnatdorlik bilan yakunlang.",
      maxScore: 5,
      keywords: ["rahmat", "xayrli kun", "ko'rishguncha"],
      guidance: [
        "\"Vaqtingiz uchun rahmat, {mijoz_ismi}.\"",
        "\"Sizni filialimizda kutamiz. Xayrli kun!\"",
        "Telefon mijoz tomondan uzilishini kutib turing.",
      ],
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

    // Tags — intentionally NOT seeded. The previous sample set (VIP,
    // qiziqish_yuqori, shikoyat, narx_so'rovi, filial_tashrifi, qaytarish)
    // turned out to be opinionated noise for most tenants. Tenant admins
    // create their own labels from Settings → Teglar.
    console.log("Tags: none seeded — tenant admins create their own.");

    // QA Scripts — both the original "Acoustic standart" and the new
    // hearing-aid sales script, idempotent on (tenantId, name). Operator
    // workspace surfaces the first active script alphabetically; rename or
    // toggle isActive to switch the primary.
    for (const def of [QA_SCRIPT, SALES_SCRIPT]) {
      const existing = await prisma.script.findFirst({
        where: { tenantId: tenant.id, name: def.name },
      });
      if (!existing) {
        const created = await prisma.script.create({
          data: {
            tenantId: tenant.id,
            name: def.name,
            sections: def.sections,
            criteria: def.criteria,
            isActive: true,
          },
        });
        console.log(`Script "${def.name}" created (${created.id}) with ${def.criteria.length} criteria`);
      } else {
        // Refresh sections/criteria on re-seed so updates to the wording in
        // this file propagate without manual DB surgery. Don't touch isActive
        // — admins control that.
        await prisma.script.update({
          where: { id: existing.id },
          data: { sections: def.sections, criteria: def.criteria },
        });
        console.log(`Script "${def.name}" refreshed (${existing.id})`);
      }
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

// Export the constants so tests can introspect the seeded shape without
// hitting the DB. Guard the entrypoint so `require()`-ing this file from a
// spec doesn't kick off a real seed.
module.exports = {
  TENANT_NAME,
  BRANCHES,
  // (TAGS removed — sample tags no longer ship with the seed.)
  PIPELINE,
  QA_SCRIPT,
  SALES_SCRIPT,
  USERS,
};

if (require.main === module) {
  main().catch((err) => {
    console.error("seed-acoustic failed:", err);
    process.exit(1);
  });
}
