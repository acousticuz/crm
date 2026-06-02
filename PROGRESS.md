# PROGRESS

## Holat
- **Asosiy 11 milestone + Settings + Call-fixes + Integration-runtime + Operator-extension tugatildi** 🎉
- Joriy ish: **Eskiz template sync + template-only SMS yuborish**
- Status: **done**
- Repo: https://github.com/acousticuz/crm

## SMS — Eskiz template-only rejim (2026-06-02)
- [x] **Adapter `fetchTemplates`**: `EskizSmsAdapter.fetchTemplates()` Eskiz `/user/templates`'dan tasdiqlangan template'larni oladi. Token muddati o'tgan bo'lsa avto-refresh. Parser ham `data[]` ham `data.result[]` shakllarni tushunadi.
- [x] **Sync endpoint** `POST /sms/templates/sync` (TENANT_ADMIN) — `SmsService.syncTemplatesFromProvider()` idempotent upsert `(tenantId, externalProvider, externalId)` unique key bo'yicha. Yangi schema kolonkalar: `externalProvider`, `externalId`, `externalStatus` + migratsiya `20260602160000_sms_template_external_id`.
- [x] **Settings UI**: SMS Integration card'iga "Template'larni sync qilish" tugmasi (faqat Eskiz uchun ko'rinadi), "Erkin matn ruxsat" checkbox (default: off). `useSyncSmsTemplates` + `useSmsSettings` hook'lari.
- [x] **Template-only yuborish**: CardDetailSheet SMS forma dropdown'da faqat template'lar. Eskiz status "service" emas bo'lsa option disabled (`moderation`/`rejected`). Preview filled vars (`{ism}`/`{sana}`/`{summa}`). Erkin matn faqat tenant `allowFreeText: true` qilsagina. Backend `sendManual` template'siz so'rovni `ForbiddenException` bilan rad qiladi.
- [x] **Live "SMS yuborildi" indikator**: Kanban kartada oxirgi SMS badge'i (status + "yuborildi/yetkazildi/xato" + nisbiy vaqt). `useKanbanRealtime` `sms:status` event'iga reaksiya qiladi → cards va card detail re-fetch. Backend `cards.service.list` `lastSms` qaytaradi.
- [x] **Operator SMS settings endpoint** `GET /sms/settings` — provider + allowFreeText + supportsTemplateSync. Operator rolli ham ko'ra oladi (RBAC).

### Verifikatsiya
- `pnpm build` — 5 paket xatosiz.
- `pnpm test` — backend **99/99** (95 + 4 yangi SMS test: free-text bloklash, template send, Eskiz parsing 2 shape, sync idempotency).
- `pnpm lint` — 0 xato.
- pm2 reload `acoustic-backend`.
- commit `feat(sms): eskiz template sync and template-based sending` + push.

## Bug fixes (2026-06-02)
- [x] **Kanban yangi ustun qo'shish**: `usePipelineAdmin.ts` createStage/updateStage/updatePipeline body'dan path param'lar (`pipelineId`/`stageId`/`id`) destructure orqali ajratiladi. Backend `ValidationPipe({ forbidNonWhitelisted: true })` endi 400 qaytarmaydi. Real HTTP test (`apps/backend/test/pipelines-http.spec.ts`, supertest + JwtAuthGuard override + Cls middleware) regression guard qo'shildi — yangi 4 ta test 201/400/200/200 ni tasdiqlaydi.
- [x] **SMS "Provayder tanlanmagan"**: `IntegrationsService.test()` ichki `decryptedForTenant()` o'chirildi, hammasi `getDecryptedConfig()`'ga ko'chirildi (provider injection bilan bitta manba). Regression test (`integrations.spec.ts`): `provider: "eskiz"` saqlangach `test()` `Provayder tanlanmagan` shoxiga tushmaydi. SMS yuborish allaqachon `getDecryptedConfig` ishlatib to'g'ri ishlardi — endi "Tekshirish" tugmasi ham to'g'ri.
- [x] **Click-to-call → sip: link (MicroSIP)**: `CardDetailSheet.tsx` va `CallsPage.tsx`'da AMI Originate o'rniga `sip:998xxxxxxxxx` URI (raqam, `+` siz). Operator brauzeridagi protocol handler MicroSIP'ni ochadi; AMI eventlari OUTBOUND'ni avtomatik yozadi. `useOriginateCall` hook va `POST /calls/originate` endpoint kelajak uchun codebase'da qoldi.

### Verifikatsiya
- `pnpm build` — 5 paket xatosiz.
- `pnpm test` — backend **95/95** (90 + SMS regression + 4 HTTP test), telephony-worker 4/4, ai-worker echo.
- `pnpm lint` — 0 xato/0 ogohlantirish.
- pm2: `acoustic-backend` reload qilindi. Worker'lar tegilmadi.
- commit `fix(kanban-sms-call): stage add, sms provider, sip-link calling` + push.


## Bajarilgan ishlar
- [x] **M0–M11** — to'liq CRM
- [x] **Settings + Integrations** — sozlamalar + integratsiyalar (AES-256-GCM)
- [x] **Call-fixes** — qo'ng'iroq jurnali + noma'lum raqam + sozlanadigan Kanban
- [x] **Lint** — barcha workspace'larda real ESLint (flat `eslint.config.mjs`, typescript-eslint). `pnpm lint` 0 xato/0 ogohlantirish bilan o'tadi.
- [x] **Integration-runtime** — saqlangan Integration konfiguratsiyasi runtime'da ishlatiladi.
- [x] **Operator-extension** — click-to-call operatorni real PJSIP extension'ga bog'laydi (quyiga qara).

## Operator → PJSIP extension (click-to-call real FreePBX uchun)
- [x] **User modeliga `extension` maydoni** qo'shildi (migration `user_extension`). Har operator o'z real PJSIP extension'iga (masalan "101") bog'lanadi.
- [x] **AMI Originate** endi `fromExtension = user.extension` (yo'q bo'lsa fallback userId) — worker `PJSIP/{extension}`'ni jiringlatadi, ilgari `fromExtension = userId` edi.
- [x] **DTO'lar** (`CreateUserDto`/`UpdateUserDto`) + `users.service` extension'ni qabul/saqlaydi (validatsiya: 2–6 raqam; bo'sh string tozalaydi). `PUBLIC_USER_SELECT`'ga qo'shildi.
- [x] **Frontend** — Settings'da yangi **"Xodimlar"** tab (`UsersManager`): operatorlar ro'yxati + yaratish/tahrirlash/o'chirish, **PJSIP extension maydoni** bilan. `useUsers` hook (CRUD).
- [x] **Test** — `calls.spec`: Originate operatorning PJSIP extension'i bilan chaqiriladi (userId emas) — `global.fetch` mock orqali tasdiqlangan.
- [x] **Auto-extension (FreePBX'dan)** — worker `GET /worker/extensions` (AMI `PJSIPShowEndpoints`) PBX endpoint nomlarini qaytaradi; backend `GET /calls/pbx/extensions` (TENANT_ADMIN) uni proksi qiladi; "Xodimlar" UI'da "FreePBX'dan" tugmasi + ko'rinadigan chips orqali extensionlar tanlanadi. PBX yetib bo'lmasa bo'sh ro'yxat (soft-degrade). Live FreePBX'da tasdiqlangan (2000–2004). ⚠️ `asterisk-manager` ActionID'ni almashtirgani uchun event-oqimini yig'ish bilan tuzatildi.
- [x] **FreePBX'dan to'liq import** — `POST /users/import-from-pbx` (TENANT_ADMIN): PBX extension ro'yxatidan har bir raqamli (trunk'siz) extension uchun OPERATOR user yaratadi (generatsiya qilingan email + bir martalik vaqtinchalik parol qaytariladi; mavjud/biriktirilgan extensionlar o'tkaziladi, idempotent). UI'da "FreePBX'dan import" tugmasi + natija jadvali (extension/email/parol). Test: `users-import.spec` (yaratish, skip existing/trunk, idempotentlik).

### Verification
- [x] `pnpm build` — 5 paket xatosiz.
- [x] `pnpm test` — backend **85/85**, worker **4/4**.
- [x] `pnpm lint` — 0 xato/0 ogohlantirish.
- [x] commit `fix(calls): map operator to real PJSIP extension for click-to-call` + push.
- ⚠️ Frontend "Xodimlar" tab type-check + build'dan o'tdi, lekin brauzerda qo'lda bosib ko'rilmadi (to'liq stack+auth kerak).

## Integration-runtime wiring (Settings endi xulqni boshqaradi)
- [x] **SMS** — `SmsService.deliver` endi avval SMS Integration'ni (shifrlangan) o'qiydi, provayder + kredensiallarni undan oladi; Integration bo'lmasa `Tenant.smsConfig`'ga qaytadi (fallback). Generic maydonlar (login/password/apiKey/sender) provayderga mos nomlarga map qilinadi (eskiz→email/from/token, playmobile→originator).
- [x] **Telefoniya worker** — backend'da `GET /internal/telephony/freepbx` (worker-secret guard) har tenantning shifrlangan AMI konfiguratsiyasini `fingerprint` bilan qaytaradi. Worker'da `TenantAmiManager` har tenant uchun AMI ulanishini boshqaradi, Integration o'zgarsa (fingerprint farqlasa) qayta ulanadi; `env AMI_*` faqat backend bo'sh/yetib bo'lmaganda fallback. Originate endi tenant bo'yicha to'g'ri AMI'ga yo'naltiriladi.
- [x] **Telegram** — `telegram` trigger action qo'shildi; `TelegramNotifierService` TELEGRAM Integration'dan botToken+chatId'ni o'qiydi.
- [x] **Inbox** — `approveDraft` va `sendManual` endi INBOX Integration'ning `pageAccessToken`'i bilan Graph API orqali real yuboradi (token bo'lmasa soft-skip, yozuv baribir SENT).
- [x] **Yangi env**: `AMI_SYNC_INTERVAL_MS` (default 30000) — worker config'ni qayta so'rash oralig'i.

### Verification
- [x] `pnpm build` — 5 paket xatosiz.
- [x] `pnpm test` — backend **84/84** (yangi `integrations-runtime.spec` — SMS/Telegram/Inbox/FreePBX uchun "Integration yangilanishi kredensiallarni o'zgartiradi" isboti), worker **4/4** (`TenantAmiManager` reconnect testi).
- [x] `pnpm lint` — 0 xato/0 ogohlantirish.
- [x] commit `fix(integrations): use saved Integration config at runtime` + push.

## Call-fixes moduli (CALL_FIXES_MODULE.md) — WebRTC YO'Q
### 1. Har bir qo'ng'iroq saqlanadi (MISSED/BUSY/FAILED ham)
- [x] **`CallStatus` ga RINGING qo'shildi** + Call'ga `endedAt` (migration `call_ringing_endedat`).
- [x] **`POST /internal/calls/started`** — qo'ng'iroq boshlanganda Call **RINGING** holatda yaratiladi (idempotent upsert). Shunda javob berilmasa ham yozuv qoladi.
- [x] **`completed`** — RINGING qatorni yakuniy holat (ANSWERED/MISSED/BUSY/FAILED) bilan yangilaydi, `endedAt` yozadi.
- [x] MISSED → callback Task avtomatik (operator/responsible/admin assignee).
- [x] Kanban kartada **qizil "javobsiz" badge** (PhoneMissed ikonka).
- [x] **"Faqat javobsiz" filtr** (Kanban filterlar paneli) + backend `missedOnly` query.
- [x] Dashboard "javobsiz qo'ng'iroqlar" KPI (operatorKpi.callsMissed — M9'da bor).

### 2. Noma'lum raqamlar
- [x] **`resolveOrCreateContact`** — kiruvchi qo'ng'iroqda raqam topilmasa, Contact avtomatik yaratiladi: `fullName="Noma'lum"`, `phones=[raqam]`, `source="inbound_call"`.
- [x] Qo'ng'iroq shu kontaktga biriktiriladi; operator keyin ismni tahrirlaydi.
- [x] **Dublikat yo'q** — bir xil raqamdan qayta qo'ng'iroqda mavjud kontaktga biriktiriladi (test bilan tasdiq).

### 3. Sozlanadigan Kanban
- [x] **`deleteStage` kartalarni ko'chiradi** (rad etmaydi): explicit `reassignTo` yoki birinchi NORMAL stage, yoki har qanday qolgan stage. Faqat oxirgi stage bo'lsa rad etadi. **Kartalar hech qachon yo'qolmaydi.**
- [x] Pipeline/Stage CRUD + reorder (M3'da bor) + **realtime emit** (`pipeline:updated`) har mutatsiyada.
- [x] **Frontend PipelineEditor** (Settings → "Voronkalar" tab): voronka yaratish/nom/default/o'chirish; ustun qo'shish (cheksiz)/nom/rang/tur(NORMAL/WON/LOST)/tartib (up/down)/o'chirish (kartalar ko'chiriladi ogohlantirish bilan).
- [x] **Kanban UX:** gorizontal scroll (bor), **ustun sarlavhasida karta soni + umumiy budjet (Σ)**, **kartalarni collapse** (yig'ish), real-time `pipeline:updated` da board+pipelines yangilanadi.

### 4. Click-to-call (WebRTC'siz)
- [x] AMI Originate (M6'da bor) — operator extension'ini jiringlatadi, ko'targach mijozga ulaydi. CRM'da OUTBOUND qayd. Brauzerda ovoz YO'Q.
- [x] Worker: `onStarted` (Newchannel) → `/started` (RINGING), `onCompleted` (Hangup) → `/completed`. AsteriskAmiClient va MockAmiClient ikkalasida.

### Verification
- [x] `pnpm build` — 5 paket xatosiz
- [x] `pnpm test` — **78/78 yashil** (12 suite; 9 yangi call-fixes spec). Eski 2 test yangi xulqqa moslandi (unknown→Noma'lum; stage delete kartalarni ko'chiradi).
- [x] **E2E (curl):** started → RINGING + Noma'lum kontakt (inbound_call); completed(MISSED) → MISSED saqlandi + endedAt + callback Task.
- [x] feat(call-log-unknown-kanban) commit + push.

## ⚠️ FreePBX worker'ni qayta ishga tushirish kerak
Worker yangi `onStarted` kodi bilan qayta build qilingan. Sizning FreePBX'ga ulangan worker'ni qayta ishga tushiring (yangi `dist`):
```bash
pkill -f "telephony-worker/dist/main.js"
BACKEND_URL="http://localhost:3005" TELEPHONY_WORKER_SECRET="dev-telephony-secret-2026" WORKER_PORT=3008 \
  AMI_MODE=asterisk AMI_HOST=192.168.20.155 AMI_PORT=5038 AMI_USERNAME=acoustic-crm \
  AMI_PASSWORD='Acoustic_AMI_2026!' AMI_TENANT_ID=cmpoupe2e00003jwybfbpbezw \
  node /var/www/acoustic-crm/apps/telephony-worker/dist/main.js &
```
Endi har kirish qo'ng'iroq (javobsiz ham) RINGING→MISSED sifatida saqlanadi va noma'lum raqamlar "Noma'lum" kontakt sifatida yaratiladi.

## Atrof-muhit
| Xizmat | Host port |
|---|---|
| Backend 3005 | Frontend 5173 | Telephony-worker 3008 | Postgres 5435 | Redis 6380 | MinIO 9100/9101 |

## Ochiq savollar / bloklar
1. **WebRTC softphone** — bu modulga KIRMAYDI (kelajakda alohida). Hozir operator alohida telefonida gaplashadi.
2. **Operator → extension xaritalash** — click-to-call hozir `fromExtension=userId`. Real ishlatishda User'ga extension maydoni kerak (keyingi kichik iteratsiya).
