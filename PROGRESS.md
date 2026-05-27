# PROGRESS

## Holat
- Joriy milestone: **M0 — Poydevor**
- Status: **done**
- Oxirgi commit: `b84ef8b` — feat(milestone-0)
- Oxirgi push: **b84ef8b → origin/main** (https://github.com/acousticuz/crm)

## Milestone'lar
- [x] **M0** — Poydevor (monorepo, docker-compose, NestJS skeleton, Prisma schema + first migration, React+Vite+shadcn, health-check)
- [ ] M1 — Auth + Multi-tenant + RBAC
- [ ] M2 — Kontaktlar + Lead'lar
- [ ] M3 — Kanban + Teglar (YADRO)
- [ ] M4 — Triggerlar
- [ ] M5 — SMS
- [ ] M6 — FreePBX telefoniya
- [ ] M7 — STT
- [ ] M8 — AI tahlil + QA
- [ ] M9 — Dashboard + KPI
- [ ] M10 — Omnichannel inbox + auto-javob
- [ ] M11 — Yakuniy (deploy + seed + smoke-test)

## Joriy milestone qadamlari (M0)
- [x] pnpm o'rnatish (v9.15.9, Node 18.19.1 mos)
- [x] git init + .gitignore + .npmrc
- [x] Monorepo skeleti: `pnpm-workspace.yaml`, root `package.json`, `apps/{backend,frontend,telephony-worker,ai-worker}`, `packages/shared`
- [x] `docker-compose.yml` (postgres, redis, minio, nginx) — parametrlangan host portlar bilan
- [x] `docker/nginx/nginx.conf` — backend+frontend uchun reverse proxy konfiguratsiyasi
- [x] `packages/shared` — enumlar (UserRole, StageType, CardStatus, CallDirection/Status, SmsStatus, LeadStatus, TaskType), umumiy tiplar, konstantalar (API_PREFIX, SOCKET_EVENTS, QUEUES)
- [x] NestJS backend skeleti — `main.ts`, `app.module.ts`, 15 ta domain module stub (auth, tenants, users, contacts, leads, pipelines, cards, tags, tasks, calls, sms, triggers, qa, analytics, inbox), `PrismaService`, `HealthController`
- [x] Prisma schema (5.1 ning hammasi): 21 ta model (Tenant, User, Branch, Contact, Pipeline, Stage, Card, Tag, CardTag, Task, Call, Transcript, Analysis, Script, QAScore, SmsTemplate, SmsLog, Lead, Trigger, Note, AuditLog), 10 ta enum, multi-tenant tenantId + soft-delete `deletedAt`
- [x] Birinchi migratsiya qo'llandi: `20260527191847_init` (633 qator SQL)
- [x] React+Vite+shadcn frontend — Tailwind 3, CSS variables (light+dark), shadcn `Button` namuna, react-router (Login/Dashboard/Kanban/404), `AppLayout`
- [x] Health-check: `GET /health` → HTTP 200 `{"status":"ok","service":"acoustic-crm-backend",...}` (Prisma ulanish tekshiruvi bilan)
- [x] `pnpm build` ikkala app va shared paketda **xatosiz** o'tdi
- [x] PROGRESS.md, DECISIONS.md, README.md yozildi
- [x] **Git commit + push** — `b84ef8b` push qilindi `origin/main` ga

## Tekshirilgan ish ko'rsatkichlari
| Komponent | Holat |
|---|---|
| `pnpm install` | OK (490 paket, 16s) |
| `pnpm build` | OK — shared, backend, frontend xatosiz qurildi |
| `prisma migrate dev --name init` | OK — `20260527191847_init` qo'llandi |
| `docker compose up postgres redis minio` | OK — barchasi sog'lom |
| `curl http://localhost:3005/health` | HTTP 200, `status:ok` (DB ulangan) |

## Atrof-muhit (port xaritasi)
Boshqa lokal loyihalar (wheelchairuz, aiop, acoustic-ai) 5432/6379/80/3000/3001 portlarini band qilgan. Ziddiyatlardan saqlanish uchun Acoustic CRM quyidagi portlarni ishlatadi:

| Xizmat | Konteyner | Host |
|---|---|---|
| Postgres | 5432 | **5435** |
| Redis | 6379 | **6380** |
| MinIO API | 9000 | **9100** |
| MinIO Console | 9001 | **9101** |
| Nginx | 80 | **8082** |
| Backend (host) | — | **3005** |
| Frontend Vite | — | 5173 |

Portlar `.env` orqali boshqariladi (`POSTGRES_HOST_PORT`, `REDIS_HOST_PORT`, ...).

## Keyingi aniq qadam
**M1 — Auth + Multi-tenant + RBAC ni boshlash:** `apps/backend/src/modules/auth` va `tenants/users` modullarini to'liq qurish — JWT access+refresh (argon2 hash), Prisma client extension/middleware (har query'da `tenantId` filtri), 5 ta rol uchun guard, AuditLog interceptor, tenant izolyatsiya birlik testi. Boshlanish nuqtasi: `apps/backend/src/modules/auth/auth.module.ts` (hozir bo'sh stub).

## Ochiq savollar / bloklar
1. **Node.js 18.19.1** — NestJS 10 va Prisma 5 bilan ishlaydi, lekin 2026 yil oxirida EOL bo'ladi. Server uchun Node 20+ ga ko'tarilish tavsiya etiladi (M11 ga qadar). — DECISIONS.md §2 ga qarang.
