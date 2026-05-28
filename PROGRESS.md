# PROGRESS

## Holat
- Joriy milestone: **M7 — STT (audio → matn)**
- Status: **done**
- Repo: https://github.com/acousticuz/crm

## Milestone'lar
- [x] **M0** — Poydevor
- [x] **M1** — Auth + Multi-tenant + RBAC
- [x] **M2** — Kontaktlar + Lead'lar
- [x] **M3** — Kanban + Teglar (YADRO)
- [x] **M4** — Triggerlar
- [x] **M5** — SMS
- [x] **M6** — FreePBX telefoniya
- [x] **M7** — STT (audio→matn, BullMQ pipeline)
- [ ] M8 — AI tahlil + QA
- [ ] M9 — Dashboard + KPI
- [ ] M10 — Omnichannel inbox + auto-javob
- [ ] M11 — Yakuniy

## M7 qadamlari — STT
### Backend
- [x] **BullMQ + ioredis** o'rnatildi. `QueueModule` (global) Redis ulanish + `Queue('stt')` provider beradi. `BULLMQ_DISABLED=1` test/dev fallback — no-op `.add()`.
- [x] **CallsService.completed** — call recordingUrl bilan tugagach STT navbatiga `{ callId, tenantId, recordingUrl, language }` enqueue qiladi. Retry policy: 3 urinish, eksponensial backoff (5s). `BULLMQ_DISABLED` paytida silentcha tashlab yuboriladi.
- [x] **TranscriptsModule** — `POST /internal/transcripts` (Public + WorkerGuard, X-Worker-Secret bilan). `TranscriptsService.write` `callId @unique` orqali upsert qiladi va Socket.io `transcript:ready` event chiqaradi. Cross-tenant write (call boshqa tenantda) 404 qaytaradi.

### apps/ai-worker (yangi workspace paketi)
- [x] **SttAdapter interfeysi** — `transcribe(req) → { text, segments, language, confidence }`; speaker ajratish va timestamp adapter ichida bo'ladi.
- [x] **MockSttAdapter** — deterministik 7-segmentli Acoustic-style intake dialog (uz tilida), operator/customer alternating, timestamplar monotonik, `confidence=0.92`. M8 QA pipeline'ini sinov uchun yetarli sifat.
- [x] **WhisperSttAdapter** skeleton — M11 da OpenAI/whisper-compatible API + diarization (pyannote) bilan to'ldiriladi.
- [x] **BackendClient** (axios) — `POST /api/v1/internal/transcripts` ga X-Worker-Secret bilan.
- [x] **runSttJob(data, deps)** — tashqaridan testable sof funksiya: adapter chaqiriladi → backend'ga POST qilinadi. main.ts uni BullMQ Worker callback'ida ishlatadi.
- [x] **main.ts** — `STT_PROVIDER` (mock|whisper) bo'yicha `buildAdapter()`, ioredis ulanadi, `new Worker(QUEUES.STT, ...)`. Concurrency=2.

### Schema (Transcript)
- [x] CLAUDE.md §5.1 dagi `Transcript` model allaqachon mavjud (text, segments JSON, language, confidence, callId @unique). Yangi migration kerak emas.

### Tests (jami 38/38, 4 yangi M7)
- [x] MockSttAdapter multi-speaker segments + monotonik timestamps + confidence
- [x] TranscriptsService.write upsert + tenant scope (call+transcript bir tenantda)
- [x] **runSttJob end-to-end** — mock adapter → backend write → DB'da segments saqlanadi
- [x] Cross-tenant write (boshqa tenant `tenantId` bilan boshqa tenantning callId'siga) 404

### Verification
- [x] `pnpm build` (shared + backend + telephony-worker + ai-worker + frontend) — **5 paket** xatosiz
- [x] `pnpm test` — 38/38 yashil
- [x] feat(milestone-7) commit + push origin/main

## Atrof-muhit
| Xizmat | Host port |
|---|---|
| Backend | 3005 |
| Frontend (Vite dev) | 5173 |
| Telephony-worker | 3008 |
| **ai-worker** | — (BullMQ consumer, port'siz) |
| Postgres | 5435 |
| Redis (BullMQ) | 6380 |
| MinIO API/Console | 9100 / 9101 |
| Nginx | 8082 |

## Konfiguratsiya
- `STT_PROVIDER` (`mock` | `whisper`) — adapter tanlash
- `OPENAI_API_KEY` (whisper uchun M11)
- `REDIS_HOST/PORT` (`localhost:6380` default)
- `BACKEND_URL` (worker → backend, default `http://localhost:3005`)
- `TELEPHONY_WORKER_SECRET` — backend + ikkala worker o'rtasidagi shared kalit
- `BULLMQ_DISABLED=1` — testlar / dev offline rejimi (enqueue silentcha tashlab yuboriladi)
- `STT_DEFAULT_LANGUAGE=uz` (default)

## Keyingi aniq qadam
**M8 — AI tahlil + QA (g'alaba yadrosi):** `apps/ai-worker` ga yangi `ai-analysis` va `qa` queue consumerlari qo'shish. LLM adapter interfeysi (Anthropic Claude yoki OpenAI) + mock; transcript'dan sentiment/topic/summary/nextStep/teg-taklif chiqarish (Analysis jadvali). Script CRUD (mezon + ball + bo'lim). QAScore baholash: LLM transcript+script → har mezon `passed + score + dalil iqtibos`, 0-100 ball. Supervayzer override. Prompts `prompts/` da versiyalanadi. Test: ma'lum transcript+script uchun barqaror baho. Boshlanish: `apps/backend/src/modules/qa/qa.module.ts` + `apps/ai-worker/src/llm`.

## Ochiq savollar / bloklar
1. **Node.js 18.19.1** — EOL yaqin (DECISIONS.md §2).
2. **Real Whisper** — M11 da ulanadi (DECISIONS.md §35).
3. **Audio file fetch** — hozir adapter `audioUrl` ni o'qiydi, lekin MinIO signed URL/proxy mexanizmi M11 da qo'shiladi (recordings hozircha mock://).
