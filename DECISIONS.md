# DECISIONS

> Loyihada qabul qilingan arxitektura/texnik qarorlar va sabablari. Har qaror sanasi va tegishli milestone bilan belgilangan.

---

## §1. Tech stack pinned versions — M0
**Qaror:** Versiyalar quyidagicha qotirildi:
- pnpm `9.15.9` (Node 18 mos)
- NestJS `10.4.6`
- Prisma `5.20.0`
- React `18.3.1`, Vite `5.4.8`, Tailwind `3.4.13`
- TypeScript `5.4.5`
- shadcn/ui `default` style, slate base color, CSS variables

**Sabab:** CLAUDE.md §2 da stack qat'iy belgilangan. NestJS 11 va Prisma 6+/7 Node 20+ talab qiladi; muhitda Node 18.19.1 ishlamoqda. NestJS 10 LTS + Prisma 5 = barqaror kombinatsiya. Yangilash M11 da yoki Node 20+ ga ko'tarilgandan keyin amalga oshiriladi.

---

## §2. Node.js 18.19.1 — vaqtinchalik
**Qaror:** Hozirgi muhitda Node 18.19.1 ishlatiladi. Prisma 5 va NestJS 10 bilan mos. Production deploy'dan oldin Node 20+ ga ko'tarilish kerak.

**Sabab:** Hozirgi tizimda o'rnatilgan Node versiyasi 18.19.1. nvm/n yo'q, sudo parol kerak. M0 ni bloklamaslik uchun mavjud versiya bilan davom etildi. M11 dan oldin Node 20 LTS ga o'tish PROGRESS.md ochiq savollar ro'yxatida.

---

## §3. Git remote — `acousticuz/crm` (GitHub)
**Qaror:** Git remote `origin = https://github.com/acousticuz/crm.git`. `main` branch'i `origin/main`'ni kuzatadi. M0 commit (`b84ef8b`) push qilindi.

**Sabab:** CLAUDE.md §8 ga ko'ra remote URL foydalanuvchidan so'raldi va M0 hisobotida qabul qilindi.

---

## §4. Host port mapping (avoid clashes)
**Qaror:** Acoustic CRM xizmatlari quyidagi host portlardan foydalanadi:
- Postgres: `5435` (containerda 5432)
- Redis: `6380` (containerda 6379)
- MinIO API/Console: `9100`/`9101`
- Nginx: `8082`
- Backend (host process): `3005`

Konteyner ichidagi portlar standart. Host portlari `.env` orqali boshqariladi.

**Sabab:** Server'da boshqa loyihalar (wheelchairuz, aiop, acoustic-ai) 5432, 6379, 80, 3000, 3001 portlarini band qilgan. Konfliktlardan saqlanish uchun yangi diapazon tanlandi.

---

## §5. Multi-tenant isolation strategy
**Qaror:** Har domain jadval `tenantId` ustuniga ega (Tenant'dan tashqari). Izolyatsiya quyidagicha majburlanadi:
1. **Prisma Client Extension** — barcha `findMany`, `findFirst`, `update`, `delete` operatsiyalarida `where.tenantId = currentTenantId` ni avtomatik qo'shadi (M1 da implementatsiya).
2. **API Guard** — har request'da JWT'dan `tenantId` olinadi, AsyncLocalStorage'ga yoziladi, Prisma extension shu yerdan o'qiydi.
3. **Tests** — M1 da tenant-A foydalanuvchisi tenant-B ma'lumotini o'qiya olmasligi MAJBURIY testdir.

**Sabab:** CLAUDE.md §4 va §10 multi-tenant izolyatsiyani qatъiy talab qiladi. Defense-in-depth — application va data qatlamida ham tekshiriladi.

---

## §6. Soft-delete via `deletedAt`
**Qaror:** Barcha domain jadvallarda `deletedAt DateTime?` ustuni. Aslida o'chirilmaydi — `deletedAt = now()` yoziladi va Prisma extension default'da ularni filtrlaydi.

**Sabab:** CRM ma'lumotlari uchun audit izi muhim (mijoz/lead/kartani tasodifan o'chirib bo'lmaydi). AuditLog bilan birgalikda to'liq tarix saqlanadi.

---

## §7. Adapter pattern for STT/LLM/SMS (deferred to M5/M7/M8)
**Qaror:** STT, LLM, SMS provayderlar interfeys orqali abstraktlanadi. M0 da faqat tip stub'lari (`packages/shared`). Implementatsiyalar:
- SMS — M5 (Eskiz.uz + Play Mobile)
- STT — M7
- LLM — M8

**Sabab:** CLAUDE.md §2 va §4 da `Adapter pattern` majburiy. O'zbekiston bozorida provayder almashtirish ehtimoli yuqori (narx, sifat, til qo'llab-quvvatlash).

---

## §8. Backend module layout — modular monolith
**Qaror:** 15 ta NestJS module: `auth`, `tenants`, `users`, `contacts`, `leads`, `pipelines`, `cards`, `tags`, `tasks`, `calls`, `sms`, `triggers`, `qa`, `analytics`, `inbox` + infrastruktura modullari: `prisma`, `health`.

**Sabab:** CLAUDE.md §4 — "Modulli monolit". Har modul alohida domen yadrosi; M11 da kerak bo'lsa microservices'ga ajratish oson.

---

## §9. Prisma model naming
**Qaror:** Modellar `PascalCase`, jadvallar `snake_case` (Prisma `@@map`). Asosiy nom CLAUDE.md §5.1 bilan moslangan (Tenant, User, Card, ...).

**Sabab:** Postgres konventsiyasi va Prisma idiomatic — type-safe TS qatlami camelCase, DB plural snake_case.

---

## §10. Prisma schema symlinked into backend
**Qaror:** `apps/backend/prisma` → `../../prisma` symlink. Repo root'da `prisma/schema.prisma` (CLAUDE.md §3 ga muvofiq) saqlanadi, lekin Prisma CLI workspace package'idan ishlatish uchun symlink kerak.

**Sabab:** Prisma CLI `--schema <path>` flagi bilan ishlaganda schema directory'da package.json yo'qligini sezsa, `pnpm add prisma -D` ni avtomatik chaqirib xato beradi. Symlink esa Prisma'ga in-place schema deb tushuntiradi. Linux/Mac'da git symlink'larni qo'llab-quvvatlaydi; Windows'da `core.symlinks=true` kerak.

---

## §11. Globally unique email (across tenants) — M1
**Qaror:** Foydalanuvchi `email` butun tizim bo'ylab unique (schema `@@unique([tenantId, email])` saqlanadi, lekin application qatlamida global tekshiriladi). Login `{ email, password }` orqali — tenant slug yoki X-Tenant-Id headerisiz.

**Sabab:** O'zbek call-markazlarida bir operator bir vaqtning o'zida ikki tenantda ishlash sodir emas. Email yagona qilish login UX'ini juda soddalashtiradi. Agar kelajakda zarur bo'lsa, `email+tenantSlug` ga o'tish mumkin (qaytmas o'zgarish emas).

**Implementatsiya:** `UsersService.create()` va `TenantsService.createWithAdmin()` boshqa tenantlarda ham mavjudligini tekshiradi (base `prisma.user` orqali — extension chetlab o'tiladi).

---

## §12. Super-admin seed script in JavaScript (not TS)
**Qaror:** `apps/backend/scripts/seed.js` — plain CommonJS. `prisma:seed` skript orqali ishga tushadi.

**Sabab:** ts-node monorepo tsconfig'i bilan konflikt qildi (`moduleResolution must be set to NodeNext`). One-shot skript uchun TS qatlami chiqarib tashlandi — qiymat-narx nisbati past. Seed Prisma client va argon2 ni to'g'ridan-to'g'ri ishlatadi.

---

## §13. Default super-admin credentials — dev only
**Qaror:** Seed default email `admin@acoustic.local`, parol `ChangeMe!2026`. `SUPERADMIN_EMAIL` va `SUPERADMIN_PASSWORD` env orqali override qilinadi.

**Sabab:** Lokal dev'ni boshlash uchun bo'sh seed bo'lishi kerak. **Prod muhitda majburiy override**: deploy skriptida `SUPERADMIN_PASSWORD` set bo'lmasa, build to'xtaydi (M11 da implementatsiya). Hozircha PROGRESS.md ochiq savollarda eslatma bor.

---

## §14. JWT — two-secret access+refresh design
**Qaror:** Access token `JWT_ACCESS_SECRET` bilan imzolanadi (15 min default), refresh token `JWT_REFRESH_SECRET` bilan (7 kun default). Refresh tokenlar payload'i `{ sub, tokenType: "refresh" }` — minimal.

**Sabab:** Ikki sirning afzalliklari: agar access secret kompromiss bo'lsa, refresh tokenlar saqlanadi va inverse. Token rotation M11 da (refresh token DB jadvali bilan).

---

## §15. Prisma extension via `$allOperations`
**Qaror:** Bir umumiy `$allOperations` hook orqali barcha tenant-scoped modellar uchun yagona kod yo'li. `findUnique` ga ham injectsion qiladi (Prisma 5 da bu unique-only emas qabul qilinadi). Service qatlami tenant-scoped lookups uchun `findFirst({ id, ... })` ishlatishi kerak — `findUnique({ id })` IDga ko'ra ishlasada, extension all-purpose; defense-in-depth uchun barchasini `findFirst` ga aylantirish maslahat.

**Sabab:** Bitta umumiy hook 16 ta model uchun takror kodni qisqartiradi. `$allOperations` Prisma 5+ da rasmiy API. CardTag, Transcript, Analysis, QAScore — `tenantId` ustuni yo'q, lekin parent (Card/Call) orqali izolyatsiya. Ular uchun extension hech narsa qilmaydi; service qatlami parent'ni avval tekshiradi.

---

## §16. CLS — request context propagation
**Qaror:** `nestjs-cls` (AsyncLocalStorage wrapper) per-so'rov kontekstni boshqaradi. JwtStrategy `validate()` ichida `writeContext()` chaqiriladi — bu Prisma extension uchun tenantId beradi.

**Sabab:** Express middleware/guard zanjirida konteksni o'tkazish standart muammo. `nestjs-cls` zamonaviy, sinovdan o'tgan kutubxona. AsyncLocalStorage Node 18+ da barqaror. Test'da ham bevosita `cls.run(...)` orqali kontekst yaratish oson.

---

## §17. Webhook authentication via `Tenant.settings.webhookSecret`
**Qaror:** Public lead intake URL: `POST /api/v1/leads/webhook/:tenantId/:source` + `X-Webhook-Secret` header. Secret tenant yaratilganda `crypto.randomBytes(24).toString("hex")` orqali generatsiya qilinadi va `Tenant.settings.webhookSecret` JSON ustunida saqlanadi. `getWebhookSecret(tenantId)` faqat ACTIVE tenantlar uchun ishlaydi.

**Sabab:** Webhook ishonchli IP'lardan kelmasligini bilamiz (FB, IG, sayt). Tenant boshiga noyob sir — to'g'ridan-to'g'ri JWT'siz ishonchli. `Tenant.settings` JSON yangi migration talab qilmaydi, sxemaga moslashuvchi. Rotation M5/M11 da `POST /tenants/:id/regenerate-webhook` (tenant-admin) orqali ulanadi.

---

## §18. Default Pipeline seeded per tenant — M2
**Qaror:** Har yangi tenant yaratilganda default `Sotuv` pipeline (5 stage: Yangi → Bog'lanildi → Taklif yuborildi → Yutdi (WON) → Yo'qotdi (LOST)) avtomatik seed qilinadi. Adminlar M3 da boshqarishi mumkin.

**Sabab:** M2 ning lead-accept oqimi Card yaratish uchun pipeline+stage talab qiladi. Bo'sh tenant'da har bir lead-accept 400 berishi yomon UX. Default pipeline tenant onboarding'ni "shu yerda boshlang" tezligida qiladi. Asl AmoCRM ham xuddi shunday yondashadi.

---

## §19. Phone normalization rules
**Qaror:** `normalizePhone(input)` ko'p formatda kiritilgan telefonlarni kanonik `+998901234567` shakliga keltiradi:
- `+` bilan boshlansa, `+` saqlab, qolgan barcha non-digit'ni o'chiradi
- `998` bilan boshlansa, `+` qo'shadi
- 9 raqamli mahalliy raqam bo'lsa, `+998` prefiks
- Boshqa hollarda raqamlarni qoldirib `+` qo'shadi

**Sabab:** Dublikat tekshiruvi uchun bir xil raqamning turli ko'rinishlari (`+998 90 123 45 67` vs `998901234567`) bir xil hash bo'lishi shart. Strict E.164 emas — Uzbek tilida pragmatik. M2 testi 4 ta input variantni bir xil kanonik formatga keltirayotganini tasdiqlaydi.

---

## §20. GIN index on `Contact.phones` deferred
**Qaror:** Prisma'da `String[]` ustun uchun GIN index sintaksisi preview-feature, M0 da `@@index([tenantId])` + `@@index([tenantId, email])` qoldirildi. Telefon bo'yicha tezkor qidiruv kerak bo'lsa (M2), GIN index'ni raw SQL migration orqali qo'shamiz.

**Sabab:** Loyihaning birinchi migratsiyasini sodda saqlash; M2 da Contact dublikat aniqlash logikasiga kelganda haqiqiy index strategiyasi belgilanadi.
