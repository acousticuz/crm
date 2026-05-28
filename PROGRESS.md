# PROGRESS

## Holat
- **Asosiy 11 milestone + Settings/Integrations moduli tugatildi** 🎉
- Joriy ish: **Settings + Integrations moduli** (SETTINGS_MODULE.md)
- Status: **done**
- Repo: https://github.com/acousticuz/crm

## Milestone'lar
- [x] **M0–M11** — to'liq (poydevor → yakuniy deploy/seed/smoke-test)
- [x] **Settings + Integrations** — sozlamalar va integratsiyalar moduli

## Settings + Integrations moduli (SETTINGS_MODULE.md)
### Schema (migration `20260528..._add_integrations`)
- [x] **Integration** model — tenantId, type(FREEPBX|SMS|TELEGRAM|INBOX), provider?, config(Json — sirlar shifrlangan), status(CONNECTED|DISCONNECTED|ERROR), lastTestedAt, lastTestResult. Unique `(tenantId, type)`. Enums shared'da ham.

### Backend
- [x] **AES-256-GCM crypto** (`common/crypto.ts`) — `ENCRYPTION_KEY` (scrypt-derived 32B); `encryptSecret`/`decryptSecret` (iv:tag:cipher), `maskSecret` (oxirgi 4 belgi), `isEncrypted`.
- [x] **Secret field registry** (`integration-fields.ts`) — har tur uchun qaysi maydonlar sir: FREEPBX→amiSecret; SMS→apiKey,password; TELEGRAM→botToken; INBOX→pageAccessToken. Public fields whitelisted.
- [x] **IntegrationsService**:
  - `upsert` — sirlarni shifrlaydi (`_encrypted` ostida), public fieldlar ochiq; maskalangan/bo'sh sir kelса eski sir saqlanadi; noma'lum field rad etiladi; AuditLog (sirlarsiz, faqat field nomlari)
  - `get`/`list` — maskalangan (`••••••1234`); `_encrypted` bag hech qachon API'ga chiqmaydi
  - `getDecryptedConfig` — faqat backend-ichki (workerlar/test uchun)
  - `test` — FreePBX (raw AMI Login+CoreStatus TCP), SMS (Eskiz auth / Play basic), Telegram (getMe), Inbox (Graph me) — natija umumiy, sir oshkor qilinmaydi (rule 7)
  - `disconnect` — status DISCONNECTED, config saqlanadi
- [x] **IntegrationsController** — `/integrations` GET/`:type` GET/PUT/`:type/test`/`:type/disconnect`. **Faqat TENANT_ADMIN** (RolesGuard).
- [x] **Super-admin Settings**:
  - TenantsController: PATCH `/tenants/:id/status`, PATCH `/tenants/:id/limits` (SUPER_ADMIN)
  - PlatformController: GET/PUT `/platform/settings` (default STT/LLM provayder + default limitlar; `__system__` tenant settings'da)

### Xavfsizlik (5.11.3) — barchasi bajarildi
1. ✅ Sirlar AES-256-GCM bilan shifrlangan (DB'da plaintext yo'q — test tasdiqlaydi)
2. ✅ Frontendga sirlar maskalanган (`••••••cret`); to'liq sir hech qachon qaytmaydi
3. ✅ Faqat TENANT_ADMIN (RBAC; OPERATOR → 403 — e2e tasdiqlandi)
4. ✅ Har o'zgarish AuditLog'da (sirlarsiz — faqat field nomlari, secret nomlari ham chiqarib tashlanadi)
5. ✅ Multi-tenant izolyatsiya (test: tenant B tenant A integratsiyasini ko'rmaydi)
6. ✅ OAuth (Inbox/Telegram) — token orqali, parol so'ralmaydi
7. ✅ Test natijasi umumiy, ichki sir/token oshkor qilinmaydi

### ⚠️ Yo'l-yo'lakay topilgan va tuzatilgan bug
- **Prisma tenant-extension `TENANT_SCOPED_MODELS` ro'yxati eskirgan edi** — M1'dan keyin qo'shilgan `InboxThread`, `InboxMessage`, `Integration` modellari ro'yxatda yo'q edi → `prisma.t.X` so'rovlari tenant bo'yicha filtrlanmasdi (cross-tenant leak). Ro'yxatga qo'shildi va test bilan tasdiqlandi.
- **`QueueModule` + `TranscriptsModule` AppModule'ga ulanmagan edi** (M7/M8'da app.module commit'iga tushmay qolган) → `/internal/transcripts` va STT enqueue ishlamasdi. Endi ulandi (`IntegrationsModule` bilan birga).

### Frontend
- [x] **SettingsPage** (`/settings`) — 4 ta integratsiya karta: status badge (ulangan ✓ / xato / ulanmagan), "Sozlash" forma (har tur uchun maydonlar; sirlar password-uslub + "bo'sh qoldiring" hint), Saqlash / Tekshirish / Uzish tugmalari. TENANT_ADMIN emas bo'lsa — ogohlantirish.
- [x] **useIntegrations** hooklar (list/save/test/disconnect)
- [x] AppLayout nav: "Sozlamalar" link; router `/settings`

### Verification
- [x] `pnpm build` — 5 paket xatosiz
- [x] `pnpm test` — **69/69 yashil** (11 suite; 11 yangi integratsiya spec)
- [x] **E2E**: PUT FreePBX → javobda `••••••cret`; DB'da plaintext sir yo'q + `_encrypted` bor; OPERATOR → 403
- [x] feat(settings-integrations) commit + push

## Atrof-muhit
| Xizmat | Host port |
|---|---|
| Backend | 3005 | Frontend 5173 | Telephony-worker 3008 | Postgres 5435 | Redis 6380 | MinIO 9100/9101 |

## Konfiguratsiya (yangi)
- **`ENCRYPTION_KEY`** — integratsiya sirlarini shifrlash uchun (>=16 belgi; prod'da 32+ random). **Majburiy** integratsiyalar ishlashi uchun.

## Keyingi aniq qadam
Integratsiyalarni realga ulash: SMS modul (M5) va telephony-worker (M6) hozir env/Tenant.settings dan o'qiydi — ularni `IntegrationsService.getDecryptedConfig(tenantId, type)` ga o'tkazish (saqlangan, shifrlangan config'ni ishlatish). Bu keyingi kichik iteratsiya.

## Ochiq savollar / bloklar
1. **Node.js 18.19.1** — EOL yaqin; Dockerfile'lar node:20.
2. **Real adapterlar** (Asterisk/Whisper/Claude/Graph API) — interfeyslar tayyor; customer onboarding'da ulanadi.
