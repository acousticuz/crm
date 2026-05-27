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

## §11. GIN index on `Contact.phones` deferred
**Qaror:** Prisma'da `String[]` ustun uchun GIN index sintaksisi preview-feature, M0 da `@@index([tenantId])` + `@@index([tenantId, email])` qoldirildi. Telefon bo'yicha tezkor qidiruv kerak bo'lsa (M2), GIN index'ni raw SQL migration orqali qo'shamiz.

**Sabab:** Loyihaning birinchi migratsiyasini sodda saqlash; M2 da Contact dublikat aniqlash logikasiga kelganda haqiqiy index strategiyasi belgilanadi.
