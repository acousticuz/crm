# Acoustic CRM

O'zbekiston call-markazlari uchun **multi-tenant SaaS CRM** — AmoCRM uslubidagi Kanban, FreePBX telefoniya, AI suhbat tahlili va sifat nazorati (QA). 11 milestone bo'ylab to'liq tugatilgan; smoke-test orqali butun pipeline tasdiqlangan.

> **Asosiy farqlovchi xususiyat:** o'zbek tilida ishlaydigan **AI suhbat tahlili va QA baholash**. Telefoniya FreePBX/Asterisk'dan keladi, CRM uni qabul qiladi, transcript qiladi, baholaydi va trigger orqali avtomatik harakatlar bajaradi (SMS yuborish, vazifa yaratish, karta ko'chirish).

## Imkoniyatlar

| Modul | Funksionallik |
|---|---|
| **Auth + RBAC** | JWT (access+refresh) + argon2; 5 rol (SUPER_ADMIN/TENANT_ADMIN/SUPERVISOR/OPERATOR/ANALYST); Prisma client extension barcha so'rovlarga `tenantId` filtrini qo'shadi |
| **Kanban (Yadro)** | Pipeline + Stage CRUD; Card CRUD; `@dnd-kit` drag-and-drop; Socket.io real-time; filtrlar (teg/mas'ul/filial/manba/sana) + qidiruv (ism/telefon); detail panel (kontakt, teglar, vazifalar, izohlar, qo'ng'iroqlar, SMS) |
| **Kontaktlar + Lead'lar** | Contact CRUD + telefon dublikat aniqlash; Lead webhook (website/Facebook/Instagram); UNSORTED → ACCEPTED (Card yaratiladi) yoki REJECTED; manba bo'yicha avto-taqsim |
| **Triggerlar** | Event-driven (`@nestjs/event-emitter`): card.created/moved, tag.added/removed, lead.created; shartlar (manba/filial/mas'ul/teg/budjet); harakatlar (move-card, add/remove-tag, create-task, **SMS**) |
| **SMS** | Eskiz.uz + Play Mobile + Mock adapter; SmsTemplate `{ism}/{sana}/{summa}` o'zgaruvchilar; manual + trigger send; delivery webhook; rate-limit (60s/telefon-3/tenant-60) |
| **FreePBX telefoniya** | `telephony-worker` AMI ulanish (mock + real skeleton); kirish screen-pop Socket.io; click-to-call AMI Originate; MISSED → callback Task; CDR-ga idempotent upsert |
| **STT** | `ai-worker` BullMQ consumer; Whisper + Mock adapter; o'zbek/rus diarization; Transcript saqlash |
| **AI tahlil + QA** | LLM adapter (Claude + Mock); sentiment/topic/summary/nextStep/teg-taklif; QA: Script (mezon + ball) → har mezon `passed + score + evidence iqtibos`; supervayzer override; promptlar `prompts/` da versiyalanadi |
| **Dashboard + KPI** | Operator KPI (kirish/chiqish, QA, konversiya, skript rioya, sentiment); supervayzer team taqqoslash; eng zaif/kuchli mezonlar; trend chartlar; scorecard `/scorecard/:callId` |
| **Omnichannel Inbox** | Instagram/Facebook DM va comment webhook; AI draft generatsiyasi; **medical/pricing/legal guardrails** — auto-send hech qachon; AuditLog har transition |

## Stack

NestJS · Prisma · PostgreSQL · BullMQ + Redis · React + Vite · Tailwind + shadcn/ui · @dnd-kit · Socket.io · recharts · MinIO · Docker

To'liq qarorlar va arxitektura: [`CLAUDE.md`](./CLAUDE.md) (loyiha konteksti) va [`DECISIONS.md`](./DECISIONS.md) (47 ta qaror).

## Monorepo

```
apps/
  backend/            # NestJS API (HTTP + WebSocket)
  frontend/           # React + Vite SPA
  telephony-worker/   # FreePBX/AMI konnektori
  ai-worker/          # STT + LLM (BullMQ consumer)
packages/
  shared/             # Umumiy enumlar + tiplar
prisma/               # schema.prisma + migratsiyalar
docker/               # Dockerfile va nginx config (dev + prod)
docker-compose.yml         # Dev infra (postgres/redis/minio/nginx)
docker-compose.prod.yml    # Prod barchasi
prompts/              # LLM promptlar (versiyalangan)
scripts/              # backup-db.sh, issue-ssl.sh
```

## Tezkor boshlash (development)

### 1. Talablar
- Node.js ≥ 18.18 (LTS 20+ tavsiya)
- pnpm 9
- Docker + Docker Compose

### 2. O'rnatish

```bash
cp .env.example .env
pnpm install
```

### 3. Infrastruktura

```bash
docker compose up -d postgres redis minio
```

### 4. Migratsiyalar va seed

```bash
pnpm --filter @acoustic-crm/backend prisma:migrate
pnpm --filter @acoustic-crm/backend prisma:seed             # super-admin
pnpm --filter @acoustic-crm/backend prisma:seed-acoustic    # Acoustic demo tenant
```

### 5. Servislarni ishga tushirish

Doimiy ishlash uchun PM2 backend/workerlarni yuritadi, frontend esa Nginx orqali bitta portda beriladi.

```bash
docker compose up -d postgres redis minio
pnpm build
pm2 start ecosystem.config.cjs
```

### 6. Brauzerda

- **Admin:** http://localhost:8082 — `admin@acoustic.uz` / `Acoustic4114`
- **Swagger:** http://localhost:8082/api/docs
- **Health:** http://localhost:8082/health

## Test

```bash
pnpm build      # 5 paket xatosiz qurilishi kerak
pnpm test       # 58/58 backend tests (smoke + tenant izolyatsiya + barcha M1..M10)
```

Smoke-test (`test/smoke.spec.ts`) butun pipelineni tasdiqlaydi: call → transcript → analysis → QA score → trigger → SMS.

## Production deploy

### 1. Domain + DNS
Domeningiz (`acoustic.example.com`) A-record server IP'siga yo'naltirilgan bo'lishi kerak.

### 2. Konfiguratsiya
```bash
cp .env.example .env.prod
# Quyidagilarni to'ldiring:
#   DATABASE_URL, POSTGRES_PASSWORD, REDIS_HOST=redis, MINIO_*
#   JWT_ACCESS_SECRET, JWT_REFRESH_SECRET (har biri 32+ baytli random)
#   TELEPHONY_WORKER_SECRET (32 baytli random)
#   PUBLIC_ORIGIN=https://acoustic.example.com
#   AMI_MODE=asterisk + AMI_* (real PBX bo'lsa) yoki mock
#   STT_PROVIDER + OPENAI_API_KEY (yoki mock)
#   LLM_PROVIDER + ANTHROPIC_API_KEY (yoki mock)
```

### 3. SSL sertifikati (Let's Encrypt)

```bash
# Birinchi marta — nginx faqat HTTP'da ko'tarib, /.well-known yo'naltiradi
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d nginx
./scripts/issue-ssl.sh acoustic.example.com admin@example.com
docker compose -f docker-compose.prod.yml exec nginx nginx -s reload
```

### 4. To'liq stack

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
docker compose -f docker-compose.prod.yml exec backend node dist/main.js  # tekshirish
# Migratsiyalarni qo'llang:
docker compose -f docker-compose.prod.yml exec backend pnpm prisma:migrate:deploy
# Acoustic seed (faqat birinchi marta):
docker compose -f docker-compose.prod.yml exec backend pnpm prisma:seed
docker compose -f docker-compose.prod.yml exec backend pnpm prisma:seed-acoustic
```

### 5. Backup (kunlik cron)

```bash
# Host crontab -e:
30 2 * * * cd /opt/acoustic-crm && docker compose -f docker-compose.prod.yml exec -T postgres /backups/backup-db.sh
```

So'nggi 14 kunlik dumplar `./backups/acoustic-*.sql.gz` da saqlanadi.

## Port xaritasi

| Xizmat | Dev host | Prod (containerda) |
|---|---|---|
| Backend | 3005 (ichki, browser uchun emas) | 3001 (internal) |
| Frontend + API public kirish | 8082 | 80 / 443 |
| Telephony-worker | 3008 | 3008 (internal) |
| ai-worker | — | — |
| Postgres | 5435 | 5432 (internal) |
| Redis | 6380 | 6379 (internal) |
| MinIO API/Console | 9100 / 9101 | 9000 / 9001 (internal) |
| Nginx | 8082 (dev) | **80 / 443 (public)** |

## Konfiguratsiya (asosiy env vars)

| Var | Tavsif |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | JWT imzo kalitlari (har biri 32+ baytli random) |
| `TELEPHONY_WORKER_SECRET` | Backend ↔ telephony-worker ↔ ai-worker shared sir |
| `BULLMQ_DISABLED` | Testlar/offline dev uchun `1` |
| `AMI_MODE` | `mock` (default) yoki `asterisk` |
| `STT_PROVIDER` | `mock` (default) yoki `whisper` |
| `LLM_PROVIDER` | `mock` (default) yoki `claude` |
| `SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD` | Seed credentials |
| `ACOUSTIC_TENANT_ADMIN_PASSWORD` | Acoustic tenant admin parol seed override |
| `SWAGGER_ENABLED` | Prod'da Swagger UI'ni yoqish `1` |

## Skriptlar

| Buyruq | Tavsif |
|---|---|
| `pnpm build` | Barcha workspaces |
| `pnpm test` | Backend testlari (58/58) |
| `pnpm lint` | Lint |
| `pnpm dev:backend` / `pnpm dev:frontend` | Dev rejimi |
| `pnpm prisma:generate` / `prisma:migrate` | Prisma |
| `pnpm prisma:seed` | Super-admin |
| `pnpm prisma:seed-acoustic` | Acoustic demo tenant |
| `pnpm --filter @acoustic-crm/backend reset:user-passwords` | Barcha aktiv userlar parolini `Acoustic4114` ga reset qiladi |
| `./scripts/issue-ssl.sh <domain> <email>` | Let's Encrypt sertifikat |
| `./scripts/backup-db.sh` | Postgres dump |

## Hujjatlar

- [`CLAUDE.md`](./CLAUDE.md) — loyiha konteksti, modullar, milestonelar (manba haqiqat)
- [`PROGRESS.md`](./PROGRESS.md) — handoff holati (har push'dan oldin yangilanadi)
- [`DECISIONS.md`](./DECISIONS.md) — 47 ta arxitektura/texnik qaror
- `prompts/analysis.v1.md`, `prompts/qa-grade.v1.md` — LLM promptlari

## Loyiha holati

Barcha 11 milestone (M0 → M11) tugatilgan. `pnpm test` 58/58 yashil, jumladan to'liq smoke-test (call→transcript→analysis→QA→trigger→SMS). Production deployment uchun `docker-compose.prod.yml` + `./scripts/` to'liq tayyor.

Mock adapter'lar prod-ga ko'chish vaqtida real provayderlarga almashtiriladi:
- **AMI**: `MockAmiClient` → `AsteriskAmiClient` (asterisk-manager npm)
- **STT**: `MockSttAdapter` → `WhisperSttAdapter` (OpenAI Whisper + diarization)
- **LLM**: `MockLlmAdapter` → `ClaudeLlmAdapter` (Anthropic SDK)
- **SMS**: `MockSmsAdapter` → `EskizSmsAdapter` / `PlayMobileSmsAdapter` (allaqachon real)
- **Inbox**: webhook payload Graph API formati tayyor, real send + signature M11+ da ulanadi
