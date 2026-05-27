# Acoustic CRM

O'zbekiston call-markazlari uchun **multi-tenant SaaS CRM** — AmoCRM uslubidagi Kanban, FreePBX telefoniya va o'zbek tilida AI suhbat tahlili / sifat nazorati (QA).

> Asosiy farqlovchi xususiyat — o'zbek tilida ishlaydigan **AI suhbat tahlili va QA baholash**. Telefoniya FreePBX/Asterisk'dan keladi, CRM qabul qiladi va qayta ishlaydi.

## Texnologik stek

NestJS · Prisma · PostgreSQL · BullMQ + Redis · React + Vite · Tailwind + shadcn/ui · @dnd-kit · Socket.io · MinIO · Docker

To'liq stek va arxitektura qarorlari — [`CLAUDE.md`](./CLAUDE.md) §2–§4 ga qarang.

## Monorepo strukturasi

```
apps/
  backend/            # NestJS API
  frontend/           # React + Vite + shadcn
  telephony-worker/   # FreePBX/AMI konnektori (M6)
  ai-worker/          # STT + LLM tahlil (M7+M8)
packages/
  shared/             # Umumiy tiplar, enumlar, konstantalar
prisma/               # schema.prisma + migratsiyalar
docker/nginx/         # Reverse proxy konfiguratsiyasi
docker-compose.yml
```

## Tezkor boshlash (development)

### 1. Talablar
- Node.js ≥ 18.18 (LTS tavsiya: 20+)
- pnpm 9
- Docker + Docker Compose

### 2. O'rnatish

```bash
cp .env.example .env
pnpm install
```

### 3. Infrastrukturani ko'tarish

```bash
docker compose up -d postgres redis minio
```

### 4. Birinchi migratsiyani qo'llash

```bash
pnpm --filter @acoustic-crm/backend prisma:migrate
```

### 5. Backend va frontend'ni ishga tushirish

```bash
pnpm dev:backend   # http://localhost:3005
pnpm dev:frontend  # http://localhost:5173
```

### 6. Health-check

```bash
curl http://localhost:3005/health
# => {"status":"ok","service":"acoustic-crm-backend",...}
```

## Port xaritasi

| Xizmat | Host port |
|---|---|
| Backend | 3005 |
| Frontend (Vite) | 5173 |
| Postgres | 5435 |
| Redis | 6380 |
| MinIO API | 9100 |
| MinIO Console | 9101 |
| Nginx | 8082 |

Boshqa loyihalardan farqlash uchun standart bo'lmagan portlar tanlandi — [`DECISIONS.md §4`](./DECISIONS.md) ga qarang.

## Skriptlar

| Buyruq | Tavsif |
|---|---|
| `pnpm build` | Barcha workspaces (shared + backend + frontend) |
| `pnpm test` | Barcha workspaces testlari |
| `pnpm lint` | Barcha workspaces lint |
| `pnpm dev:backend` | NestJS hot-reload |
| `pnpm dev:frontend` | Vite dev server |
| `pnpm prisma:generate` | Prisma client'ni qayta yaratish |
| `pnpm prisma:migrate` | `prisma migrate dev` |
| `pnpm docker:up` / `docker:down` | Compose stack |

## Hujjatlar

- [`CLAUDE.md`](./CLAUDE.md) — loyiha konteksti, modullar, milestonelar (asosiy)
- [`PROGRESS.md`](./PROGRESS.md) — handoff holati (har push'dan oldin yangilanadi)
- [`DECISIONS.md`](./DECISIONS.md) — arxitektura/texnik qarorlar
- [`goals.md`](./goals.md) — har milestone uchun `/goal` buyruqlari

## Hozirgi holat — M0 ✅

- Monorepo, docker-compose (postgres/redis/minio/nginx), NestJS skeleti
- Prisma schema (5.1 dagi 21 model) + birinchi migratsiya
- React+Vite+shadcn frontend skeleti + router
- Health-check 200 OK

Keyingi: **M1 — Auth + Multi-tenant + RBAC** ([`goals.md`](./goals.md) ga qarang).
