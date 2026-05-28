# PROGRESS

## Holat
- **Loyiha tugatildi** 🎉
- Joriy milestone: **M11 — Yakuniy (deploy + seed + smoke-test)**
- Status: **done**
- Repo: https://github.com/acousticuz/crm

## Milestone'lar
- [x] **M0** — Poydevor
- [x] **M1** — Auth + Multi-tenant + RBAC
- [x] **M2** — Kontaktlar + Lead'lar
- [x] **M3** — Kanban + Teglar
- [x] **M4** — Triggerlar
- [x] **M5** — SMS
- [x] **M6** — FreePBX telefoniya
- [x] **M7** — STT
- [x] **M8** — AI tahlil + QA
- [x] **M9** — Dashboard + KPI
- [x] **M10** — Omnichannel inbox + auto-javob
- [x] **M11** — Yakuniy (deploy + seed + smoke-test) ✅

## M11 qadamlari — Yakuniy
### Production stack
- [x] **`docker-compose.prod.yml`** — postgres/redis/minio/backend/frontend/telephony-worker/ai-worker/nginx 8 ta xizmat. Tashqi port faqat nginx (80/443).
- [x] **`docker/backend.Dockerfile`**, **`telephony-worker.Dockerfile`**, **`ai-worker.Dockerfile`**, **`frontend.Dockerfile`** — multi-stage Node 20 Alpine, prod build, minimal runtime.
- [x] **`docker/nginx-prod/`** — nginx.conf + conf.d/acoustic.conf: HTTPS, security headers (HSTS, X-Frame-Options, ...), `/api/` → backend, `/socket.io/` upgrade, SPA fallback.
- [x] **`scripts/issue-ssl.sh`** — Let's Encrypt webroot certificate issuance.
- [x] **`scripts/backup-db.sh`** — pg_dump → gzip, 14 kunlik retention, container-mounted `/backups`.

### Backend hardening
- [x] **Swagger** `@nestjs/swagger` ulandi: `/api/docs` da OpenAPI UI. Prod'da SWAGGER_ENABLED=1 bilan yoqiladi. Bearer JWT scheme.
- [x] **Acoustic seed script** (`apps/backend/scripts/seed-acoustic.js`):
  - Tenant "Acoustic" + auto-generated webhookSecret
  - **22 ta filial** (Toshkent tumanlari + 10 viloyat markazlari)
  - Default pipeline "Sotuv" + 5 stage
  - 6 ta tag (VIP, qiziqish_yuqori, shikoyat, narx_so'rovi, filial_tashrifi, qaytarish)
  - QA script "Acoustic standart" + 4 mezon (uz keywords MockLlm uchun)
  - 5 user: TENANT_ADMIN + SUPERVISOR + 3 OPERATOR turli filiallarda
  - Idempotent (har bir entiti `findFirst` orqali tekshiriladi)

### Smoke-test (asosiy talab)
- [x] **`apps/backend/test/smoke.spec.ts`** — full pipeline jest spec. Bitta test 6 qadamni ketma-ket bajaradi:
  1. AMI inbound call → `CallsService.completed` → Call row
  2. STT job (`runSttJob` + MockSttAdapter) → Transcript row
  3. Analysis job (`runAnalysisJob` + MockLlmAdapter) → Analysis row
  4. QA job (`runQaJob`) → QAScore row (4-mezonli 70 max)
  5. Trigger config (`card.moved` → `stageWonId`, action: `sms`) + Card create + move
  6. **Trigger → SMS yuboriladi** — MockSmsAdapter.sent va SmsLog.SENT tasdiqlanadi

### README + Hujjatlar
- [x] **README.md** to'liq qayta yozildi: imkoniyatlar matritsasi, stack, monorepo struktura, dev quick-start, **prod deploy yo'riqnomasi** (SSL, env, backup cron), port xaritasi, konfiguratsiya env vars, mock → real adapter ko'chish yo'li.
- [x] **DECISIONS.md** 47 ta qaror — M0..M11 to'liq.

### Verification
- [x] `pnpm build` — 5 paket xatosiz
- [x] `pnpm test` — **58/58 yashil** (10 ta test suite, jumladan smoke + tenant izolyatsiya + barcha M1..M10)
- [x] Smoke-test alohida `--testPathPattern=smoke` orqali ham yashil (1/1, 114 ms)
- [x] Acoustic seed ishga tushdi va 22 filial + 5 user yaratdi
- [x] feat(milestone-11) commit + push origin/main

## Test xulosa (final)

| Test suite | Specs |
|---|---|
| tenant-isolation.spec.ts | 5 (multi-tenant invariant) |
| contacts-leads.spec.ts | 8 (M2) |
| kanban.spec.ts | 10 (M3) |
| sms.spec.ts | 6 (M5) — M4 trigger orqali ham tekshiriladi |
| calls.spec.ts | 5 (M6) |
| stt.spec.ts | 4 (M7) |
| qa.spec.ts | 6 (M8) |
| analytics.spec.ts | 5 (M9) |
| inbox.spec.ts | 8 (M10 — guardrails) |
| **smoke.spec.ts** | **1 (M11 — full pipeline)** |
| **JAMI** | **58/58 yashil** |

## Atrof-muhit (final)
| Xizmat | Dev port | Prod (containerda) |
|---|---|---|
| Backend | 3005 | 3001 (internal) |
| Frontend | 5173 | 80 (internal, nginx orqali) |
| Telephony-worker | 3008 | 3008 (internal) |
| ai-worker | — | — |
| Postgres / Redis / MinIO / Nginx | 5435/6380/9100/8082 (dev) | internal / 80,443 public |

## Keyingi qadamlar (loyiha tugagandan keyin)
Loyiha **tugatildi**. Quyidagilar real customer onboarding'da to'ldiriladi:
1. **Real Asterisk PBX ulanish** — `AsteriskAmiClient.connect()` + `asterisk-manager` npm
2. **Real Whisper STT** — `WhisperSttAdapter.transcribe()` + diarization (pyannote service)
3. **Real Claude LLM** — `ClaudeLlmAdapter` + `@anthropic-ai/sdk` (prompts allaqachon `prompts/*.v1.md`)
4. **Real Graph API inbox** — Instagram/Facebook webhook signature verification + send to Graph API
5. **Node.js 20+** — Dockerfile'larda allaqachon node:20-alpine; dev environment'da yangilash
6. **GIN index** `Contact.phones` — raw SQL migration million qatorga yaqinlashganda

## Ochiq savollar / bloklar
**Yo'q.** Mahsulot prod deploy uchun tayyor.
