# PROGRESS

## Holat
- Joriy milestone: **M8 — AI tahlil + QA (g'alaba yadrosi)**
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
- [x] **M7** — STT (audio→matn)
- [x] **M8** — AI tahlil + QA (g'alaba yadrosi)
- [ ] M9 — Dashboard + KPI
- [ ] M10 — Omnichannel inbox + auto-javob
- [ ] M11 — Yakuniy

## M8 qadamlari — AI tahlil + QA
### Backend (qa module)
- [x] **Script CRUD** (`/qa/scripts` REST):
  - DTO: `name`, `sections[]`, `criteria[{id, section, text, maxScore, keywords?}]`, `isActive`
  - TENANT_ADMIN/SUPERVISOR yozish; barchasi o'qiy oladi
- [x] **Analysis va QAScore yozish endpointlari** (worker uchun):
  - `POST /internal/analyses` (WorkerGuard) — Analysis upsert by `callId @unique`. Cross-tenant write 404.
  - `POST /internal/qa-scores` (WorkerGuard) — QAScore upsert by `(callId, scriptId)` (manual findFirst+update, schema'da composite unique yo'q). Cross-tenant 404.
- [x] **Supervisor override** — PATCH `/qa/scores/:id/override` (SUPERVISOR): `supervisorOverride` JSON va `reviewedBy` yoziladi. AuditLog (`qa.override`).
- [x] **Scorecard read** — `GET /qa/scorecard/:callId` (barcha rollar) — Analysis + QAScores[] + Transcript birgalikda.
- [x] **Pipeline ulanishi**:
  - `QueueModule` AI_ANALYSIS_QUEUE va QA_QUEUE provider qo'shdi (BULLMQ_DISABLED test fallback bilan).
  - `TranscriptsService.write` → tarjima yozilgach `qa.enqueueAnalysis({tenantId, callId})` chaqiriladi; payload transcript text+segments+language bilan.
  - `QaService.writeAnalysis` → har bir active Script uchun QA job navbatga qo'shadi (transcript + criteria payloadda).

### apps/ai-worker (LLM kengaytmasi)
- [x] **LlmAdapter interfeysi** — `analyze(transcript) → {sentiment, topic, summary, nextStep, keyPoints, suggestedTags}` va `grade(transcript, criteria) → {totalScore, maxScore, criteriaResults[]}`.
- [x] **MockLlmAdapter** — deterministik:
  - **Analysis**: kalit so'zlar bo'yicha sentiment (`shikoyat|qaytarish` → negative; `rahmat|xursand` → positive), topic (narx/qaytarish/shikoyat/filial/...), summary (birinchi 2 segment), nextStep (topic ga qarab), keyPoints (customer segmentlari), suggestedTags
  - **Grading**: har mezon `keywords[]` (yoki `text` kalit so'zlari) substring bo'yicha transcript segmentlarda izlanadi. Topilsa → `passed=true, score=maxScore, evidence=qator iqtibos`. Topilmasa → `passed=false, score=0, evidence="evidence not found"`. Total = score yig'indisi.
- [x] **ClaudeLlmAdapter** skeleton — M11 da `@anthropic-ai/sdk` bilan to'ldiriladi.
- [x] **prompts/ versiyalanadi**:
  - `prompts/analysis.v1.md` — o'zbek tilida system prompt, JSON output format, **tibbiy maslahat berma** xavfsizlik qoidasi
  - `prompts/qa-grade.v1.md` — bir mezonni baholash prompt, dalil iqtibos majburiy
  - `prompts.ts` loader (real adapter uchun)
- [x] **Worker pipeline**:
  - `runAnalysisJob(data, deps)` va `runQaJob(data, deps)` — sof testable funksiyalar
  - main.ts uchta navbat consumeri (STT + AI_ANALYSIS + QA), STT_PROVIDER/LLM_PROVIDER env bo'yicha adapter tanlash, concurrency=2
  - BackendClient `writeAnalysis()`/`writeQAScore()` qo'shildi (axios + X-Worker-Secret)

### Tests (44/44 yashil, 6 yangi M8)
- [x] **MockLlmAdapter analysis** transcript'da `narx` topadi, sentiment=`positive` (rahmat/xursand bor), summary/nextStep/tags
- [x] **QA grading**: 4-mezonli script (Salomlashish 10/Ehtiyoj 20/Filial 15/Chegirma 15 = max 60) MockSttAdapter transcript'iga: 3 ta passed (10+20+15=45), 1 ta failed (chegirma yo'q). Har passed mezon `evidence` — transcript segmentidan to'liq qator
- [x] **runAnalysisJob + runQaJob end-to-end** — adapter → backend service → DB'da Analysis va QAScore saqlanadi
- [x] **Supervisor override** `supervisorOverride.totalScore=50` va `reviewedBy=userId` yoziladi
- [x] **scorecard()** — Analysis + QAScore + Transcript birgalikda qaytaradi
- [x] **Cross-tenant write** `writeAnalysis` boshqa tenant'dan 404 (DiD)

### Verification
- [x] `pnpm build` (5 paket — shared/backend/telephony-worker/ai-worker/frontend) xatosiz
- [x] `pnpm test` — **44/44 yashil**
- [x] feat(milestone-8) commit + push origin/main

## Atrof-muhit
| Xizmat | Host port |
|---|---|
| Backend | 3005 |
| Frontend (Vite dev) | 5173 |
| Telephony-worker | 3008 |
| ai-worker | — (3 BullMQ queue consumer) |
| Postgres | 5435 |
| Redis (BullMQ) | 6380 |
| MinIO | 9100 / 9101 |
| Nginx | 8082 |

## Konfiguratsiya
- `LLM_PROVIDER` (`mock` | `claude`)
- `ANTHROPIC_API_KEY` (claude uchun M11)
- `LLM_MODEL` (default: claude-haiku/sonnet keyingi versiya)

## Keyingi aniq qadam
**M9 — Dashboard + KPI:** `apps/backend/src/modules/analytics` ni to'ldiring — operator KPI (qo'ng'iroqlar soni, o'rtacha QA ball, konversiya %, davomiylik, sentiment %, skript rioya %), supervayzer filial/team taqqoslashi, per-call scorecard UI, trend grafikalari. Frontend: `/dashboard` sahifasini to'liq quring. Boshlanish: `apps/backend/src/modules/analytics/analytics.module.ts`.

## Ochiq savollar / bloklar
1. **Node.js 18.19.1** — EOL yaqin (DECISIONS.md §2).
2. **Real LLM (Claude API)** — M11 da `@anthropic-ai/sdk` bilan ulashish; prompts allaqachon `prompts/*.v1.md`.
