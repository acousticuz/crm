# PROGRESS

## Holat
- Joriy milestone: **M2 — Kontaktlar + Lead'lar**
- Status: **done**
- Repo: https://github.com/acousticuz/crm
- Branch: `main` (`origin/main` ni kuzatadi)

## Milestone'lar
- [x] **M0** — Poydevor
- [x] **M1** — Auth + Multi-tenant + RBAC
- [x] **M2** — Kontaktlar + Lead'lar
- [ ] M3 — Kanban + Teglar (YADRO)
- [ ] M4 — Triggerlar
- [ ] M5 — SMS
- [ ] M6 — FreePBX telefoniya
- [ ] M7 — STT
- [ ] M8 — AI tahlil + QA
- [ ] M9 — Dashboard + KPI
- [ ] M10 — Omnichannel inbox + auto-javob
- [ ] M11 — Yakuniy (deploy + seed + smoke-test)

## Joriy milestone qadamlari (M2)
- [x] **Phone normalization** (`apps/backend/src/common/phone.ts`) — Uzbek '+998' variantlarini kanonik formatga keltiradi (`+998 90 123 45 67` → `+998901234567`).
- [x] **Tenant bootstrap kengaytirildi** — `TenantsService.createWithAdmin()` endi `webhookSecret` (24 baytlik hex) yaratadi va default `Sotuv` pipeline + 5 stage (Yangi/Bog'lanildi/Taklif yuborildi/Yutdi/Yo'qotdi) seed qiladi. Bu Lead.accept ga karta joylashtirish uchun joy beradi.
- [x] **ContactsModule** — `ContactsService` (create with dup-check, list with q+filters+pagination, findById, update, softDelete, findByPhones, findOrCreateByPhone) + REST `/contacts` (CRUD + `/contacts/check` duplicate endpoint). RBAC: TENANT_ADMIN/SUPERVISOR/OPERATOR yozish; ANALYST faqat o'qish.
- [x] **Duplicate detection** — telefonlar normallashtirilib `phones: { hasSome }` orqali tekshiriladi. Bir xil raqamning turli ko'rinishlari ham aniqlanadi.
- [x] **LeadsModule** — `LeadsService` (createFromWebhook, list, unsorted, findById, accept, reject), `WebhookGuard` (X-Webhook-Secret header'ni Tenant.settings.webhookSecret bilan tekshiradi va CLS scope o'rnatadi).
- [x] **Webhook endpoints (public)** — `POST /leads/webhook/:tenantId/:source` (website/facebook/instagram va boshqa manbalar uchun). Secret yo'q → 401.
- [x] **Lead lifecycle** — UNSORTED → ACCEPTED (Card yaratiladi, Contact bog'lanadi yoki yaratiladi) yoki REJECTED. Ikkinchi marta accept/reject 400.
- [x] **Auto-distribution** — Tenant.settings.leadDistribution dan o'qiydi (defaultPipelineId/defaultResponsibleUserId/sourceRules). Yo'q bo'lsa default Pipeline + birinchi NORMAL stage.
- [x] **Source tracking** — har bir Lead/Contact `source` ustuni; Lead.rawData JSON da to'liq payload saqlanadi (analytics M9 uchun).
- [x] **Tests (test/contacts-leads.spec.ts)** — 8 ta spec:
  - phone normalization 4 ta variant
  - create + duplicate detection (normallashgan variantlar bilan ham)
  - search by name va phone
  - webhook lead UNSORTED status, source preserved
  - accept Card yaratadi va lead ni ACCEPTED qiladi
  - accept twice 400
  - reject + accept after reject 400
  - accept existing-phone contact ni qayta ishlatadi
- [x] **All tests pass**: 13/13 (5 ta M1 + 8 ta M2)
- [x] End-to-end smoke (curl): super-admin tenant yaratdi → tenant-admin login → contact CRUD → webhook secret valid/invalid → lead accept → Card + Contact yaratildi
- [x] `pnpm build` va `pnpm test` xatosiz o'tadi
- [x] feat(milestone-2) commit + push qilindi

## Atrof-muhit
| Xizmat | Host port |
|---|---|
| Backend | 3005 |
| Frontend (Vite) | 5173 |
| Postgres | 5435 |
| Redis | 6380 |
| MinIO API/Console | 9100 / 9101 |
| Nginx | 8082 |

## Keyingi aniq qadam
**M3 — Kanban + Teglar (YADRO) boshlash:** `apps/backend/src/modules/pipelines` (Pipeline+Stage CRUD), `apps/backend/src/modules/cards` (Card CRUD + DnD endpoint), `apps/backend/src/modules/tags` (Tag CRUD + attach), `apps/backend/src/modules/tasks` (Task CRUD), Note/izohlar. Socket.io ulanish (`@nestjs/websockets` + adapter), real-time `card:moved` event. Frontend — `@dnd-kit/core` bilan AmoCRM uslubidagi Kanban; karta detal paneli (`/kanban` sahifani to'ldirish). Boshlanish nuqtasi: `apps/backend/src/modules/pipelines/pipelines.module.ts`.

## Ochiq savollar / bloklar
1. **Node.js 18.19.1** — EOL yaqin. M11 ga qadar Node 20+ ga ko'tarilish (DECISIONS.md §2).
2. **Default SUPER_ADMIN credentials** — Prod muhitda majburiy `SUPERADMIN_PASSWORD` env tekshiruvi (M11 da implementatsiya).
3. **GIN index on `Contact.phones`** — hozirgi `phones: { hasSome }` qidiruvi katta tenantlarda sekinlashishi mumkin. M3 yoki M9 da raw SQL migration orqali GIN qo'shish (DECISIONS.md §17).
