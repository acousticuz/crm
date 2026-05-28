# PROGRESS

## Holat
- Joriy milestone: **M10 — Omnichannel inbox + auto-javob**
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
- [x] **M10** — Omnichannel inbox + auto-javob (medical/pricing/legal guardrails)
- [ ] M11 — Yakuniy (deploy + seed + smoke-test)

## M10 qadamlari
### Schema (migration `20260528013941_add_inbox`)
- [x] **InboxThread** model — tenantId, channel ("instagram"/"facebook"/...), externalThreadId (Graph API conversation id), contactId?, status, lastMessageAt. Unique constraint `(tenantId, channel, externalThreadId)`.
- [x] **InboxMessage** model — tenantId, threadId, direction (INBOUND/OUTBOUND), sender (customer/operator/ai-draft), text, status (RECEIVED/DRAFT/NEEDS_REVIEW/APPROVED/SENT/REJECTED), **sensitiveCategories String[]**, approvedBy, rejectionReason, externalMessageId, sentAt.

### Backend (InboxModule)
- [x] **sensitivity.ts** — regex-asosida medical/pricing/legal kalit so'zlar detektori (o'zbek + rus). False positive xavfsiz emas (operator ko'rib chiqishi arzon; xato auto-send qimmat).
- [x] **InboxWebhookGuard** — `X-Webhook-Secret` tekshiruvi (lead webhook bilan bir xil tenant-secret).
- [x] **InboxService.ingestWebhook(tenantId, channel, dto)**:
  - Thread upsert by `(tenantId, channel, externalThreadId)`
  - INBOUND xabar saqlanadi
  - **AI draft generatsiya qilinadi** (template-based, til-mos): salomlashish + kanalga ishora + javob fasli
  - `detectSensitiveCategories(input + draft)` — agar topilsa, status=`NEEDS_REVIEW` va sensitiveCategories array to'ldiriladi. Aks holda status=`DRAFT`
  - **AuditLog** `inbox.draft.created` (har bir auto-draft yoziladi, `autoSendBlocked` flag bilan)
- [x] **approveDraft(messageId, { text? })** — operator tahrirlangan matnga **qayta sensitivity tekshiruvi**, status=`SENT`, sentAt, approvedBy=userId. AuditLog `inbox.draft.approved`.
- [x] **rejectDraft(messageId, { reason })** — status=`REJECTED`, rejectionReason, approvedBy=userId. AuditLog `inbox.draft.rejected`.
- [x] **sendManual(threadId, { text })** — operator yangidan xabar yuboradi (drafsiz). Yana sensitivity tag qilinadi (audit completeness uchun).
- [x] **listThreads + getThread + pendingDrafts** o'qish endpointlari
- [x] **Endpoints**:
  - `POST /internal/inbox/webhook/:tenantId/:channel` (Public + InboxWebhookGuard)
  - `GET /inbox/threads`, `GET /inbox/threads/:id`, `GET /inbox/pending-drafts`
  - `POST /inbox/messages/:id/approve` va `/reject` (operator/supervisor/admin)
  - `POST /inbox/threads/:id/messages` manual send

### Frontend
- [x] **InboxPage** (`/inbox`) — ikki-ustun layout:
  - Chap: threadlar ro'yxati (mijoz nomi, kanal badge, oxirgi xabar, sana)
  - O'ng: tanlangan thread'ning to'liq message tarixi (chat-uslub, INBOUND chap / OUTBOUND o'ng)
  - **DraftEditor** — dashed amber border draft xabarlar uchun; `sensitiveCategories` qizil Badge AlertTriangle bilan; tahrirlanadigan textarea; "Tasdiqlash va yuborish" + "Rad etish" (reason input bilan)
  - **ManualSender** — draft yo'q bo'lsa, fresh xabar yozish
- [x] **AppLayout navigatsiya** — "Inbox" link qo'shildi
- [x] **Router** — `/inbox` route AppLayout ichida

### Tests (57/57 yashil, 8 yangi M10)
- [x] `detectSensitiveCategories` medical/pricing/legal va clean text uchun
- [x] Webhook benign message → DRAFT, no sensitive flags
- [x] **Webhook sensitive (tibbiy) message → NEEDS_REVIEW + AuditLog `autoSendBlocked: true`**
- [x] approveDraft → SENT, reviewer + AuditLog
- [x] **approveDraft operator-edited text'ga qayta sensitivity check** (operator chegirma/narx kiritsa, qayta flag qilinadi)
- [x] rejectDraft + AuditLog + state machine (approve-after-reject 400)
- [x] **Multi-tenant izolyatsiya** — boshqa tenant'ning threadlari ko'rinmaydi

### Verification
- [x] `pnpm build` — 5 paket xatosiz
- [x] `pnpm test` — **57/57 yashil**
- [x] feat(milestone-10) commit + push origin/main

## Atrof-muhit
| Xizmat | Host port |
|---|---|
| Backend | 3005 |
| Frontend | 5173 |
| Telephony-worker | 3008 |
| ai-worker | 3 BullMQ queue consumer |
| Postgres / Redis / MinIO / Nginx | 5435 / 6380 / 9100-9101 / 8082 |

## Keyingi aniq qadam
**M11 — Yakuniy (deploy + seed + smoke-test):** `docker-compose.prod.yml` ishlab chiqing (multi-stage Docker images, env layout, healthchecks). Nginx + SSL (Let's Encrypt). DB backup skript (pg_dump cron). Swagger annotatsiyalar barcha controllers'da. README'da deploy + run yo'riqnomasi. Acoustic seed (1 tenant + 22 filial + pipeline + script + teglar + namuna foydalanuvchilar). **Smoke-test skript** — qo'ng'iroq (mock AMI) → transcript → AI tahlil → QA → trigger → SMS. Boshlanish: `docker-compose.prod.yml` va `apps/backend/scripts/seed-acoustic.js`.

## Ochiq savollar / bloklar
1. **Node.js 18.19.1** — EOL yaqin (DECISIONS.md §2).
2. **Real Graph API integration** (Instagram/Facebook DM va comment) — webhook payload shape va auth (App-secret signature) M11 da to'ldiriladi.
3. **Real send-to-Graph-API** — approveDraft hozir status'ni SENT qiladi lekin tashqi API chaqirmaydi (mock). M11 da `@instagram/messaging` yoki direct Graph API'ga POST.
