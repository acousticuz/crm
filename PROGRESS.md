# PROGRESS

## Holat
- **Asosiy 11 milestone + Settings + Call-fixes modullari tugatildi** 🎉
- Joriy ish: **Call-log / Noma'lum raqam / Sozlanadigan Kanban** (CALL_FIXES_MODULE.md) — WebRTC'siz
- Status: **done**
- Repo: https://github.com/acousticuz/crm

## Bajarilgan ishlar
- [x] **M0–M11** — to'liq CRM
- [x] **Settings + Integrations** — sozlamalar + integratsiyalar (AES-256-GCM)
- [x] **Call-fixes** — qo'ng'iroq jurnali + noma'lum raqam + sozlanadigan Kanban
- [x] **Lint** — barcha workspace'larda real ESLint (flat `eslint.config.mjs`, typescript-eslint). `pnpm lint` 0 xato/0 ogohlantirish bilan o'tadi.

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
