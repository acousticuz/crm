# PROGRESS

## Holat
- **Asosiy 11 milestone + Settings + Call-fixes + Integration-runtime + Operator-extension tugatildi** 🎉
- Joriy ish: **Kanban board redesign — kartalar, ustunlar, filtrlar**
- Status: **done**
- Repo: https://github.com/acousticuz/crm

## Kanban board redesign (2026-06-03)
- [x] **`KanbanCard`** (vizual): card-surface bilan rounded-md border + shadow-xs; hover'da `-translate-y-px` + shadow-md (yumshoq lift); drag paytida ring-primary/40 + shadow-overlay; title 2-line clamp, kontakt+telefon kompakt klaster (Phone iconly muted); meta row (oxirgi SMS + due date) 2xs zinc tonida; tag badge'lar, tagsiz bo'lsa render bo'lmaydi; footer'da deterministik palitra'dan keladigan `Avatar` initials chip + mas'ul ismi. Drag/keyboard/click — barchasi avvalgidek.
- [x] **`KanbanColumn`** (vizual): rangli accent rail tepada (2px); collapse tugmasi 6×6 hover-tinted; sarlavha + count chip + WON/LOST semantic chip (Trophy/XCircle); Σ budget alohida 2xs qator; WON/LOST ustunlar success/destructive 4% tint + tone border; drop highlight `bg-primary/5 ring-1 ring-primary/30`; collapsed mode 56px ingichka rail (vertical-rl yo'nalishda nom + count rozetka); bo'sh ustun border-dashed placeholder.
- [x] **`KanbanFilters`** (vizual): 3 ta qator — primary (Voronka select + global search + Faqat javobsiz + Tozalash badge with count) → secondary (Mas'ul/Manba/Filial/Sana) → tag chip cloud (filter ikona + Badge'lar `ring-primary/40` on active). Search input X bilan tozalovchi. Active filter count avtomatik hisoblanadi.
- [x] **`KanbanPage`** (vizual): page heading row pipeline nomi + jami karta soni; horizontal scroll `[scrollbar-gutter:stable]`; loading/empty state'lar yumshoq border-dashed bilan.
- [x] **Mantiqqa tegilmadi**: `@dnd-kit` sensors / `DndContext` / `useDraggable` / `useDroppable` / `useMoveCard` / `useKanbanRealtime` / `useCards` / Socket.io invalidation — hammasi avvalgidek. Faqat 4 ta vizual fayl o'zgardi.

### Verifikatsiya
- `pnpm build` — 5 paket xatosiz (CSS 34.0 → 36.2 KB Kanban utility class'lari).
- `pnpm test` — backend **117/117** (Kanban vizual o'zgarish backendga ta'sir qilmadi).
- `pnpm lint` — 0 xato.
- commit `feat(design): kanban board redesign` + push.

## App shell redesign — sidebar + top bar (2026-06-03)
- [x] **Yangi `Sidebar` komponenti** (`components/shell/Sidebar.tsx`) — chap qator: brand (Waves icon + "Acoustic CRM"), 5 ta nav item (KanbanSquare, Phone, Inbox, BarChart3, Settings ikonkalari), faol NavLink primary-tonli `bg-primary/10 text-primary`, sidebar collapse tugmasi (icon-only mode, `w-[232px]` ↔ `w-[64px]`). Routes va to/label hech qanday o'zgarmadi.
- [x] **Yangi `TopBar` komponenti** (`components/shell/TopBar.tsx`) — minimal h-14 sticky bar: hamburger (mobile-only), global search Input (vizual placeholder, `Search` ikona), `SalesScriptPanel` (avvalgidek), `Bell` notification placeholder, foydalanuvchi email + role chiziq, "Chiqish" icon button. `bg-card/95 backdrop-blur` yumshoq glass effect.
- [x] **`AppLayout` qayta tuzilishi**: `flex` row — lg+ da persistent sticky sidebar, narrow'da Sheet ichida drawer. Mavjud `Sheet` primitive qayta ishlatildi. Main column: sticky TopBar + scrollable `<main>` `max-w-screen-2xl` content. `IncomingCallToast` o'z joyida qoldi.
- [x] **Responsive**: `<lg` (1024px ostida) sidebar drawer rejimida, top bar hamburger orqali ochiladi; nav link bosilganda drawer avtomatik yopiladi (`onNavigate` callback). Desktop'da collapse tugmasi sidebar'ni icon-only ga aylantiradi.
- [x] **Mantiqqa tegilmadi**: hooks, routes, auth, API call'lar, `IncomingCallToast`, `SalesScriptPanel`, nav itemlarining `to` qiymatlari — hammasi avvalgidek. Faqat 3 ta fayl: 2 ta yangi (`Sidebar.tsx`, `TopBar.tsx`) + `AppLayout.tsx` to'liq qayta yozildi.

### Verifikatsiya
- `pnpm build` — 5 paket xatosiz (CSS 31.5 → 34.0 KB sidebar+topbar utility'lari).
- `pnpm test` — backend **117/117** (vizual o'zgarish testga ta'sir qilmadi).
- `pnpm lint` — 0 xato.
- commit `feat(design): app shell, sidebar, topbar redesign` + push.

## Design system — modern minimalist (2026-06-03)
- [x] **Design tokenlar**: `tailwind.config.js` ga `fontFamily: Inter`, semantic colors (success/warning/info), shadow ladder (xs/sm/md/lg/overlay), refined type scale (2xs–4xl) Inter uchun tunelangan, kichikroq radius (6px), container padding qisqartirildi (1→2rem). `index.css` ga zinc-asosli neytral palette, bitta indigo primary, dark mode parallel tokenlar, `--surface` qatlami, semantic CSS variables (success/warning/info/destructive).
- [x] **Inter font**: `index.html` ga Google Fonts preconnect + Inter (400/500/600/700). `body` da `font-feature-settings` ligatures + tabular numerals (KPI tile'lar uchun).
- [x] **shadcn primitivlar qayta uslublash** (API o'zgarmadi, faqat classlar):
  - `button.tsx` — kichikroq h-9 default, tightish tracking, brightness hover, shadow-xs (was solid bg/90).
  - `input.tsx` / `textarea.tsx` — h-9, hairline border, shadow-xs, primary focus ring with offset-1.
  - `badge.tsx` — text-2xs, gap-1, soft `${color}24` tint.
  - `label.tsx` — muted-by-default text-xs, recede against the input.
  - `sheet.tsx` — bg-card + shadow-overlay, soft scrim, max-w-md, close button bg-surface hover.
- [x] **Native HTML uslubi** (`@layer base` da): `<select>` custom chevron + h-9, `<input[type=date|color|number]>` Input bilan bir xil, `<table>` minimal hairline + surface hover, scrollbar narrow neutral.
- [x] **Reusable utility classlar**: `.card-surface`, `.inset-surface`, `.stat-tile`.
- [x] **`src/lib/tokens.ts`** — `readToken()` / `tokenColor()` chart va canvas uchun (recharts strokeColor).
- [x] **`STYLE_GUIDE.md`** — to'liq tokenlar jadval, type scale, shadow ladder, layout qoidalar, yangi rang qo'shish qadamlari.

### Verifikatsiya
- Mantiqqa, hook'larga, routelarga, API call'larga TEGILMADI. Faqat 8 ta vizual fayl (tailwind.config, index.css, index.html, 5 ta shadcn primitiv + tokens.ts + STYLE_GUIDE.md).
- `pnpm build` — 5 paket xatosiz (frontend CSS 22.8KB → 31.5KB, ranglar+shadows kengayishi tabiiy).
- `pnpm test` — backend **117/117** (vizual o'zgarish backend testiga ta'sir qilmadi).
- `pnpm lint` — 0 xato.
- commit `feat(design): modern minimalist design system and base components` + push.

## Reports + branch + coaching + tag UX (2026-06-03)
- [x] **Operator ismi va extension hamma joyda**: `OperatorKpi` ga `extension` qo'shildi. `operatorKpi()` foydalanuvchini select qilganda `fullName + extension` ham qaytaradi. `teamSummary()` har row'da extension. Dashboard Jamoa taqqoslash chartining XAxis'i `"Aziz (101)"` ko'rinishida.
- [x] **`Call.branchId` per-call tegi** + migration `20260603120000_call_branch_id` (FK Branch). `PATCH /calls/:id/branch` endpoint (OPERATOR/SUPERVISOR/TENANT_ADMIN). `GET /branches` endpoint dropdown uchun. CardDetailSheet CallRow'da har qator yonida "Filial" select — saqlangach realtime cards/scorecard invalidate. `cards.service.findById`, `calls.listByCard/listByContact/listRecent/findById` hammasi branch + operator.extension qaytaradi.
- [x] **Oylik branch reporti** `GET /analytics/branches/monthly?month=YYYY-MM` — `{branchId, name, calls, uniqueLeads, cards, won, lost, open, conversionPct}`. WON/LOST = qo'lda kartani WON/LOST bosqichga ko'chirgan. Dashboard'da "Filiallar oylik hisobot" jadval.
- [x] **Murabbiylik (coaching) reporti** `GET /analytics/coaching/:operatorId?from=&to=` — totalCalls, avgQaScore, weakest 3 section (pass-rate), top 5 mistake (Analysis.mistakes'dan freq), haftalik trend (ISO week). Operator faqat o'zini ko'radi (force `userId=user.sub`); supervisor/admin har kim. Yangi `/coaching/:operatorId` sahifa Dashboard'dan link.
- [x] **Tag inline yaratish**: OPERATOR rol ham `POST /tags` qila oladi (recolor/delete admin-only qoladi). CardDetailSheet Teglar bo'limida "Yangi teg" inline form (input + rang) — yaratilgach avtomatik kartaga biriktiriladi. Yangi hook'lar: `useCreateTag`, `useBranches`, `useSetCallBranch`, `useBranchesMonthly`, `useCoaching`.

### Verifikatsiya
- `pnpm build` — 5 paket xatosiz.
- `pnpm test` — backend **117/117** (+3 yangi `branch-coaching-reports.spec`: branch monthly funnel sonlari, coaching avg/weakest/topMistakes/trend, team extension).
- `pnpm lint` — 0 xato.
- pm2 reload `acoustic-backend` (migratsiya bilan).
- commit `feat(reports-branch-kanban): named reports, branch monthly report, coaching, kanban/tags polish` + push.

## On-demand tahlil + xatoliklar ro'yxati (2026-06-03)
- [x] **Auto-enqueue olib tashlandi**: `calls.service.completed` ANSWERED qo'ng'iroqlar uchun avtomatik STT enqueue qilmaydi. STT + LLM pulli xizmat — faqat operator/supervisor "Tahlil qil" bossagina ishlaydi.
- [x] **Yangi endpoint** `POST /calls/:id/analyze` (OPERATOR/SUPERVISOR/TENANT_ADMIN). Tekshiruvlar: faqat ANSWERED, mavjud Analysis bo'lsa **409** (faqat `?force=true` bilan re-run). Force rejimida eski transcript/analysis/QAScore o'chiriladi, chain qaytadan to'liq ishlaydi. Yangi socket event `analysis:started`.
- [x] **Active sales script bo'yicha bahoss (FIX C)**: `qa.service.writeAnalysis` HAR active script uchun emas, **birinchi isActive (alphabetically)** uchun QA enqueue qiladi — operator paneli ko'rsatadigan skript bilan bir xil. Tenantning "active sales script" = yagona QA referensi.
- [x] **`Analysis.mistakes Json` ustun + migratsiya** `20260603030000_analysis_mistakes`. LLM (Claude + OpenAI + Mock) AnalysisResult'ga `mistakes[]` qaytaradi: `{section, severity, message, evidence?}`. Prompt'lar `ScriptContext`'ni oladi va operator skriptdan og'ishgan joylarni JSON ichida qaytaradi. Mock adapter deterministik (criterion keywords transcript'da yo'q bo'lsa — o'tkazib yuborilgan deb belgilanadi). Backend `enqueueAnalysis` ham activeScript kontekstini ai-worker'ga uzatadi.
- [x] **UI**:
  - CardDetailSheet'da har CallRow ochilganda 3 ta holat: `not_analyzed` ("Tahlil qil" tugmasi, pulli ogohlantirish), `analyzing` (kutilmoqda, real-time yangilanadi), `analyzed` (ball, mezonlar, "Qayta tahlil" tugmasi confirm bilan).
  - "Xatoliklar" alohida bo'lim: severity badge (low/medium/high), bo'lim nomi, xato matni, dalil.
  - QA Mezonlar `details/summary` collapsible ichida (passed/failed + dalil + ball).
  - ScorecardPage'da xatoliklar uchun prominent destructive-styled section.
  - `useKanbanRealtime` `analysis:started`/`analysis:ready`/`transcript:ready`/`qa:ready` eventlarida scorecard + card cache invalidate qiladi.
- [x] **Yangi hook** `useAnalyzeCall` — `POST /calls/:id/analyze` + force flag.

### Verifikatsiya
- `pnpm build` — 5 paket xatosiz.
- `pnpm test` — backend **114/114** (+5 yangi `on-demand-analysis.spec.ts`: no auto-enqueue / force re-analyze / MISSED rad / mistakes ishlab chiqarish / script yo'q bo'lsa bo'sh).
- `pnpm lint` — 0 xato.
- pm2 reload: acoustic-backend + acoustic-ai-worker.
- commit `feat(analysis): on-demand script-based analysis with mistake detection` + push.

## Sotuv skripti — eshitish apparatlari (2026-06-03)
- [x] **Seed**: `apps/backend/scripts/seed-acoustic.js` ga `SALES_SCRIPT` qo'shildi — 7 bo'lim (Salomlashish 10 + Ehtiyojni aniqlash 20 + Bepul tekshiruv 15 + Mahsulot 20 + E'tiroz 15 + Keyingi qadam 15 + Xayrlashish 5 = **100 ball**). Idempotent upsert; har mezonga `text` + `maxScore` + `keywords` + `guidance[]` (operator uchun aytiladigan jumlalar). Re-seed har safar sections/criteria yangilaydi (admin'ning `isActive`'iga tegmaydi). Acoustic tenant'ga deploy qilindi (`Sotuv skripti (Acoustic eshitish apparatlari)` script id `cmpxgdluw0001pxehtg9n2ueu`).
- [x] **Yuqori paneldagi "Sotuv skripti" tugmasi**: `SalesScriptPanel.tsx` — `AppLayout` header'iga tugma; bosilganda o'ng tomondan slide-over ochiladi. Backdrop `bg-black/10` (yarim shaffof) — operator qo'ng'iroq oynasidan chiqib ketmaydi. Bo'limlar collapse/expand, har biri ball + mezon matni + `guidance` o'q nuqtalari + kalit so'z chip'lari. Qo'ng'iroq paytida ko'rib turish uchun moslashtirilgan.
- [x] **`useScripts` + `useActiveScript` hook**: `apps/frontend/src/hooks/useScripts.ts` — `GET /qa/scripts` (operator ham ko'radi). Active script = ilk `isActive=true`, alphabetically — seed nomi shuni birinchi qiladi.
- [x] **Settings → "Sotuv skripti" tab**: `ScriptEditor.tsx` — chap tomonda skript ro'yxati, o'ng tomonda forma: nom, isActive, bo'limlar (qo'sh/o'chir), mezonlar (matn + bo'lim + ball + `guidance` + keywords). RBAC: SUPERVISOR + TENANT_ADMIN. SettingsPage SUPERVISOR'ga ham ochiq, lekin admin-only tab'lar yashirin.
- [x] **HTTP RBAC test**: `apps/backend/test/qa-scripts-http.spec.ts` — supertest + real `RolesGuard` (APP_GUARD), JwtAuthGuard override + ClsModule middleware tenant context. 4 ta test: operator GET 200, operator PATCH 403, supervisor PATCH 200, admin PATCH 200.

### Verifikatsiya
- `pnpm build` — 5 paket xatosiz.
- `pnpm test` — backend yashil (yangi `qa-scripts-http.spec.ts`).
- `pnpm lint` — 0 xato.
- pm2 reload `acoustic-backend`.
- commit `feat(script): hearing-aid sales script, prominent display, editable` + push.

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
