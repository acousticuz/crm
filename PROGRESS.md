# PROGRESS

## Holat
- Joriy milestone: **M6 — FreePBX telefoniya**
- Status: **done**
- Repo: https://github.com/acousticuz/crm

## Milestone'lar
- [x] **M0** — Poydevor
- [x] **M1** — Auth + Multi-tenant + RBAC
- [x] **M2** — Kontaktlar + Lead'lar
- [x] **M3** — Kanban + Teglar (YADRO)
- [x] **M4** — Triggerlar
- [x] **M5** — SMS
- [x] **M6** — FreePBX telefoniya (mock simulator + real-ready interfeys)
- [ ] M7 — STT
- [ ] M8 — AI tahlil + QA
- [ ] M9 — Dashboard + KPI
- [ ] M10 — Omnichannel inbox + auto-javob
- [ ] M11 — Yakuniy

## M6 qadamlari — FreePBX telefoniya
### Backend (calls module)
- [x] **CallsService** — to'liq oqim:
  - `incoming(dto)` — worker'dan keladigan ringing event; raqam bo'yicha Contact qidiradi, ochiq Card topadi, Socket.io `call:incoming` xona-tenant ga emit qiladi (screen-pop)
  - `completed(dto)` — `(tenantId, cdrUniqueId)` bo'yicha **upsert** (idempotent); raqamga ko'ra contact+open card aniqlanadi; MISSED → callback Task auto-create (operator → responsibleUser → birinchi admin assignee)
  - `originate(dto)` — operator click-to-call: tenant context'dan tenantId+userId oladi, `cdrUniqueId` generatsiya qiladi, telephony-worker'ga HTTP POST jo'natadi (`X-Worker-Secret`)
  - `listByCard/Contact/findById` — qo'ng'iroqlar tarixi (operator+contact+card include)
- [x] **WorkerGuard** — `X-Worker-Secret` (TELEPHONY_WORKER_SECRET env)ni tekshiradi, body.tenantId orqali CLS scope o'rnatadi → Prisma extension downstream'da to'g'ri ishlaydi.
- [x] **Endpoints**:
  - `POST /internal/calls/incoming` (Public + WorkerGuard) — screen-pop trigger
  - `POST /internal/calls/completed` (Public + WorkerGuard) — Call upsert + MISSED → Task
  - `POST /calls/originate` (operator, JwtAuthGuard+RolesGuard) — outbound originate, AuditLog
  - `GET /calls?cardId=|contactId=` va `GET /calls/:id`
- [x] **Socket.io eventlari**: `CALL_INCOMING` (screen-pop), `CALL_ENDED` (call detail yangilanishi)

### apps/telephony-worker (yangi workspace paketi)
- [x] **AmiClient interfeysi** — `connect/disconnect/originate/onIncoming/onCompleted`; typed event payloadlar (`AmiCallEvent`, `AmiCallCompleted`, `AmiOriginateRequest`)
- [x] **MockAmiClient** — to'liq in-process simulator: `simulateInbound(...)`, `simulateMissed(...)`, `originate(...)` → keyin completed eventni avtomatik chiqaradi. Test/dev/CI uchun.
- [x] **AsteriskAmiClient** skeleton — interfeys real `asterisk-manager` (npm) ulashga tayyor; M11 prod-hardening da to'ldiriladi.
- [x] **BackendClient** (axios) — `/api/v1/internal/calls/{incoming,completed}` ga POST qiladi (X-Worker-Secret bilan)
- [x] **Coordinator** — AMI event'larni backend chaqiruvlariga moslaydi (fire-and-forget log on error)
- [x] **HTTP server** (express) — `POST /worker/originate` (X-Worker-Secret bilan) backend'dan kelgan originate so'rovlarini AMI'ga uzatadi. `GET /worker/health` ham bor.
- [x] **main.ts** — `AMI_MODE` env (mock|asterisk) bo'yicha klient tanlaydi, hammasini bog'laydi.

### Frontend
- [x] **useOriginateCall** mutation hook — `POST /calls/originate`.
- [x] **CardDetailSheet** "Qo'ng'iroq qilish" tugmasi endi ishlaydi (`onClick → originate.mutate`). Disabled bo'lsa: kontakt telefoni yo'q yoki pending.
- [x] **Qo'ng'iroqlar tarixi** — placeholder olib tashlandi; haqiqiy formatlanadi (ikonka+direction+status+vaqt+davomiylik).
- [x] **IncomingCallToast** komponent — `useIncomingCallListener` hook orqali `call:incoming` socket eventiga obuna bo'ladi, fixed-position toastda kontakt+karta ma'lumotini ko'rsatadi, 30s da auto-dismiss, "Kartani ochish" tugmasi. `AppLayout` ichida har sahifada mount bo'ladi.

### Tests
- [x] `test/calls.spec.ts` — 5 ta spec:
  - MockAmiClient.simulateInbound to'liq pipeline (AMI → Coordinator → backend → Call+Contact+Card link)
  - MISSED inbound auto-Task (operator assignee, type=CALL, contact ham bog'langan)
  - incoming() noma'lum raqamga `matched=false`
  - **tenant izolyatsiya** — tenant A'ning Call ma'lumoti tenant B'da ko'rinmaydi
  - **idempotency** — bir xil `cdrUniqueId` ikkinchi marta upsert qiladi, dublikatsiz
- [x] Jami: **34/34 test yashil** (oldingi 29 + 5 M6)

### Verification
- [x] `pnpm build` (shared + backend + telephony-worker + frontend) — to'rt paket xatosiz
- [x] `pnpm test` — 34/34 yashil
- [x] feat(milestone-6) commit + push origin/main

## Atrof-muhit
| Xizmat | Host port |
|---|---|
| Backend | 3005 |
| Frontend (Vite dev) | 5173 |
| **Telephony-worker** | **3008** |
| Postgres | 5435 |
| Redis | 6380 |
| MinIO API/Console | 9100 / 9101 |
| Nginx | 8082 |

## Konfiguratsiya
- `TELEPHONY_WORKER_SECRET` (backend va worker'da bir xil sirli kalit)
- `TELEPHONY_WORKER_URL` (backend → worker, default `http://localhost:3008`)
- `BACKEND_URL` (worker → backend, default `http://localhost:3005`)
- `AMI_MODE` (`mock` | `asterisk`)
- `AMI_HOST/PORT/USERNAME/PASSWORD` — real Asterisk uchun (M11 to'ldiriladi)

## Keyingi aniq qadam
**M7 — STT:** `apps/ai-worker` skafold qiling — BullMQ consumer (queue `stt`); STT adapter interfeysi (Whisper API yoki Yandex SpeechKit + mock); o'zbek/rus tilini auto-detect; speaker diarization (kanal asosida — AMI'dan keladigan ikki kanal yoki diarization adapter); Transcript saqlash (segments + confidence + language). Yangi Call kelganda backend BullMQ'ga ish qo'shadi. Boshlanish: `apps/ai-worker/package.json`.

## Ochiq savollar / bloklar
1. **Node.js 18.19.1** — EOL yaqin (DECISIONS.md §2).
2. **Real Asterisk AMI ulanishi** — `AsteriskAmiClient` skeleton xolos. Prod uchun `asterisk-manager` npm paketi + Originate action mapping kerak (DECISIONS.md §30).
3. **Recording fayllari** — mock URL ishlatiladi. Real PBX'da MinIO ga upload mexanizmi kerak (M7 yoki M11).
