# PROGRESS

## Holat
- Joriy milestone: **M5 — SMS** (M4 — Triggerlar oldindan yopildi)
- Status: **done**
- Repo: https://github.com/acousticuz/crm

## Milestone'lar
- [x] **M0** — Poydevor
- [x] **M1** — Auth + Multi-tenant + RBAC
- [x] **M2** — Kontaktlar + Lead'lar
- [x] **M3** — Kanban + Teglar (YADRO)
- [x] **M4** — Triggerlar
- [x] **M5** — SMS
- [ ] M6 — FreePBX telefoniya
- [ ] M7 — STT
- [ ] M8 — AI tahlil + QA
- [ ] M9 — Dashboard + KPI
- [ ] M10 — Omnichannel inbox + auto-javob
- [ ] M11 — Yakuniy

## M4 qadamlari — Triggerlar
- [x] `@nestjs/event-emitter` o'rnatildi va AppModule da `EventEmitterModule.forRoot({ wildcard: true })` global ulandi.
- [x] **Domain event'lar** (`triggers/events.ts`): `domain.card.created`, `domain.card.moved`, `domain.tag.added`, `domain.tag.removed`, `domain.lead.created` — typed payloadlar bilan.
- [x] **Mavjud servicelar event emit qiladi**: CardsService.create() → CARD_CREATED, CardsService.move() → CARD_MOVED; TagsService.attach/detach → TAG_ADDED/REMOVED; LeadsService.createFromWebhook → LEAD_CREATED.
- [x] **TriggersService** — Trigger CRUD (TENANT_ADMIN), `findActiveByEvent(tenantId, eventType, pipelineId?)` engine uchun.
- [x] **TriggerEngine** — `@OnEvent(EVT.*)` orqali har domain event'ga reaktsiya qiladi. Trigger event.type (+ optional stageId/tagId) filtrlanadi; conditions (source/branchId/responsibleUserId/hasTagId/budgetMin-Max) baholanadi; actions ketma-ket bajariladi.
- [x] **Actions implementatsiyasi**: `move-card` (status flip), `add-tag` (CardTag upsert), `remove-tag` (deleteMany), `create-task` (dueInDays default 1), `sms` (M5 da to'liq ulandi — SmsModule.onModuleInit() da `engine.registerSmsHandler(...)`).
- [x] **TriggersController** — POST/GET/PATCH/DELETE `/triggers` (TENANT_ADMIN read TENANT_ADMIN/SUPERVISOR/ANALYST).

## M5 qadamlari — SMS
- [x] **SmsAdapter interfeysi** (`sms-adapter.ts`) — `send(input, providerConfig) → { status, providerMessageId, errorMessage? }`.
- [x] **Eskiz.uz adapter** — auto-login bilan token cache; `POST /message/sms/send`; status mapping.
- [x] **Play Mobile adapter** — basic auth + JSON `/send` (broker-api); originator config.
- [x] **MockSmsAdapter** — in-memory `sent[]` saqlaydi, har send `SENT` qaytaradi; testlar va dev uchun fallback.
- [x] **SmsAdapterFactory** — Tenant.smsConfig.provider bo'yicha adapterni tanlaydi (default: mock).
- [x] **Template interpolation** (`template.ts`) — `{ism}/{sana}/{summa}/{phone}/{budget}` va custom o'zgaruvchilar; noma'lum kalitlar buzilmaydi.
- [x] **SmsRateLimiter** — token-bucket-ish (60s oyna, telefon boshiga 3, tenant boshiga 60). Sinov uchun `reset()`.
- [x] **SmsService**:
  - `createTemplate/listTemplates/findTemplate/updateTemplate/deleteTemplate` CRUD
  - `sendManual(dto)` — phone normalizatsiya, rate-limit tekshiruv, QUEUED → adapter → SENT, SmsLog yoziladi, Socket.io `sms:status` emit
  - `sendFromTrigger(input)` — trigger engine'dan chaqiriladi, card → contact → vars yig'adi (ism/sana/summa/budget/phone)
  - `handleWebhook(tenantId, provider, payload)` — Eskiz/Play providerlardan delivery status yangilanadi (DELIVERED/FAILED/SENT)
- [x] **Endpoints**: POST `/sms/send` (manual), GET `/sms/templates`, POST/PATCH/DELETE `/sms/templates/:id`, GET `/sms?cardId=|contactId=`, POST `/sms/webhook/:tenantId/:provider` (Public).
- [x] **Trigger SMS action**: `{ type: "sms", templateId?, text? }` — `SmsService.onModuleInit()` engine'ga registratsiya qiladi; trigger ishlasa `sendFromTrigger` chaqiriladi.
- [x] **Frontend SMS dialog**: CardDetailSheet'da "SMS yuborish" tugmasi endi ishlaydi — shablon tanlash + matn tahrirlash + yuborish; SMS tarixi karta detali'da to'liq ko'rinadi.

## Verification
- [x] `pnpm build` (shared + backend + frontend) — xatosiz
- [x] `pnpm test` — **29/29 yashil** (5 M1 + 8 M2 + 10 M3 + 6 M5/M4 — phone interpolate, mock adapter, manual send+interpolate, rate-limit 4xx, webhook DELIVERED, trigger SMS action end-to-end)
- [x] **End-to-end smoke** (curl): tenant yaratdi → SMS template (`Salom {ism}, summa: {summa} so'm`) → manual send 201 (interpolate to'g'ri) → 4-chi tezkor send rate-limited 429 → SMS list to'g'ri qaytdi → AuditLog'da `sms.send.manual`, `sms.template.create` yozildi
- [x] feat(milestone-4) + feat(milestone-5) commit + push origin/main

## Atrof-muhit
| Xizmat | Host port |
|---|---|
| Backend | 3005 |
| Frontend (Vite dev) | 5173 |
| Postgres | 5435 |
| Redis | 6380 |
| MinIO API/Console | 9100 / 9101 |
| Nginx | 8082 |

## Keyingi aniq qadam
**M6 — FreePBX telefoniya:** `apps/telephony-worker` skafold qiling — `asterisk-manager` (npm) yoki `ami-client` orqali AMI ulanish; CDR fayllarini o'qish; recordings MinIO ga upload; backend'ga inbound call event yuborish (Socket.io screen-pop). Click-to-call uchun POST `/calls/originate` (AMI Originate). MISSED → callback Task auto-create. Real PBX yo'q bo'lsa simulator. Boshlanish: `apps/telephony-worker/package.json`.

## Ochiq savollar / bloklar
1. **Node.js 18.19.1** — EOL yaqin (DECISIONS.md §2).
2. **SMS rate limiter in-memory** — bir instanceda. Multi-replica deploy uchun Redis-backed kerak (M11).
3. **Webhook auth on /sms/webhook** — hozir secret yo'q. Prod uchun HMAC tekshiruvi qo'shilishi kerak (M11 yoki ehtiyojga ko'ra).
