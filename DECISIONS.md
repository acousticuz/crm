# DECISIONS

> Loyihada qabul qilingan arxitektura/texnik qarorlar va sabablari. Har qaror sanasi va tegishli milestone bilan belgilangan.

---

## §1. Tech stack pinned versions — M0
**Qaror:** Versiyalar quyidagicha qotirildi:
- pnpm `9.15.9` (Node 18 mos)
- NestJS `10.4.6`
- Prisma `5.20.0`
- React `18.3.1`, Vite `5.4.8`, Tailwind `3.4.13`
- TypeScript `5.4.5`
- shadcn/ui `default` style, slate base color, CSS variables

**Sabab:** CLAUDE.md §2 da stack qat'iy belgilangan. NestJS 11 va Prisma 6+/7 Node 20+ talab qiladi; muhitda Node 18.19.1 ishlamoqda. NestJS 10 LTS + Prisma 5 = barqaror kombinatsiya. Yangilash M11 da yoki Node 20+ ga ko'tarilgandan keyin amalga oshiriladi.

---

## §2. Node.js 18.19.1 — vaqtinchalik
**Qaror:** Hozirgi muhitda Node 18.19.1 ishlatiladi. Prisma 5 va NestJS 10 bilan mos. Production deploy'dan oldin Node 20+ ga ko'tarilish kerak.

**Sabab:** Hozirgi tizimda o'rnatilgan Node versiyasi 18.19.1. nvm/n yo'q, sudo parol kerak. M0 ni bloklamaslik uchun mavjud versiya bilan davom etildi. M11 dan oldin Node 20 LTS ga o'tish PROGRESS.md ochiq savollar ro'yxatida.

---

## §3. Git remote — `acousticuz/crm` (GitHub)
**Qaror:** Git remote `origin = https://github.com/acousticuz/crm.git`. `main` branch'i `origin/main`'ni kuzatadi. M0 commit (`b84ef8b`) push qilindi.

**Sabab:** CLAUDE.md §8 ga ko'ra remote URL foydalanuvchidan so'raldi va M0 hisobotida qabul qilindi.

---

## §4. Host port mapping (avoid clashes)
**Qaror:** Acoustic CRM xizmatlari quyidagi host portlardan foydalanadi:
- Postgres: `5435` (containerda 5432)
- Redis: `6380` (containerda 6379)
- MinIO API/Console: `9100`/`9101`
- Nginx: `8082`
- Backend (host process): `3005`

Konteyner ichidagi portlar standart. Host portlari `.env` orqali boshqariladi.

**Sabab:** Server'da boshqa loyihalar (wheelchairuz, aiop, acoustic-ai) 5432, 6379, 80, 3000, 3001 portlarini band qilgan. Konfliktlardan saqlanish uchun yangi diapazon tanlandi.

---

## §5. Multi-tenant isolation strategy
**Qaror:** Har domain jadval `tenantId` ustuniga ega (Tenant'dan tashqari). Izolyatsiya quyidagicha majburlanadi:
1. **Prisma Client Extension** — barcha `findMany`, `findFirst`, `update`, `delete` operatsiyalarida `where.tenantId = currentTenantId` ni avtomatik qo'shadi (M1 da implementatsiya).
2. **API Guard** — har request'da JWT'dan `tenantId` olinadi, AsyncLocalStorage'ga yoziladi, Prisma extension shu yerdan o'qiydi.
3. **Tests** — M1 da tenant-A foydalanuvchisi tenant-B ma'lumotini o'qiya olmasligi MAJBURIY testdir.

**Sabab:** CLAUDE.md §4 va §10 multi-tenant izolyatsiyani qatъiy talab qiladi. Defense-in-depth — application va data qatlamida ham tekshiriladi.

---

## §6. Soft-delete via `deletedAt`
**Qaror:** Barcha domain jadvallarda `deletedAt DateTime?` ustuni. Aslida o'chirilmaydi — `deletedAt = now()` yoziladi va Prisma extension default'da ularni filtrlaydi.

**Sabab:** CRM ma'lumotlari uchun audit izi muhim (mijoz/lead/kartani tasodifan o'chirib bo'lmaydi). AuditLog bilan birgalikda to'liq tarix saqlanadi.

---

## §7. Adapter pattern for STT/LLM/SMS (deferred to M5/M7/M8)
**Qaror:** STT, LLM, SMS provayderlar interfeys orqali abstraktlanadi. M0 da faqat tip stub'lari (`packages/shared`). Implementatsiyalar:
- SMS — M5 (Eskiz.uz + Play Mobile)
- STT — M7
- LLM — M8

**Sabab:** CLAUDE.md §2 va §4 da `Adapter pattern` majburiy. O'zbekiston bozorida provayder almashtirish ehtimoli yuqori (narx, sifat, til qo'llab-quvvatlash).

---

## §8. Backend module layout — modular monolith
**Qaror:** 15 ta NestJS module: `auth`, `tenants`, `users`, `contacts`, `leads`, `pipelines`, `cards`, `tags`, `tasks`, `calls`, `sms`, `triggers`, `qa`, `analytics`, `inbox` + infrastruktura modullari: `prisma`, `health`.

**Sabab:** CLAUDE.md §4 — "Modulli monolit". Har modul alohida domen yadrosi; M11 da kerak bo'lsa microservices'ga ajratish oson.

---

## §9. Prisma model naming
**Qaror:** Modellar `PascalCase`, jadvallar `snake_case` (Prisma `@@map`). Asosiy nom CLAUDE.md §5.1 bilan moslangan (Tenant, User, Card, ...).

**Sabab:** Postgres konventsiyasi va Prisma idiomatic — type-safe TS qatlami camelCase, DB plural snake_case.

---

## §10. Prisma schema symlinked into backend
**Qaror:** `apps/backend/prisma` → `../../prisma` symlink. Repo root'da `prisma/schema.prisma` (CLAUDE.md §3 ga muvofiq) saqlanadi, lekin Prisma CLI workspace package'idan ishlatish uchun symlink kerak.

**Sabab:** Prisma CLI `--schema <path>` flagi bilan ishlaganda schema directory'da package.json yo'qligini sezsa, `pnpm add prisma -D` ni avtomatik chaqirib xato beradi. Symlink esa Prisma'ga in-place schema deb tushuntiradi. Linux/Mac'da git symlink'larni qo'llab-quvvatlaydi; Windows'da `core.symlinks=true` kerak.

---

## §11. Globally unique email (across tenants) — M1
**Qaror:** Foydalanuvchi `email` butun tizim bo'ylab unique (schema `@@unique([tenantId, email])` saqlanadi, lekin application qatlamida global tekshiriladi). Login `{ email, password }` orqali — tenant slug yoki X-Tenant-Id headerisiz.

**Sabab:** O'zbek call-markazlarida bir operator bir vaqtning o'zida ikki tenantda ishlash sodir emas. Email yagona qilish login UX'ini juda soddalashtiradi. Agar kelajakda zarur bo'lsa, `email+tenantSlug` ga o'tish mumkin (qaytmas o'zgarish emas).

**Implementatsiya:** `UsersService.create()` va `TenantsService.createWithAdmin()` boshqa tenantlarda ham mavjudligini tekshiradi (base `prisma.user` orqali — extension chetlab o'tiladi).

---

## §12. Super-admin seed script in JavaScript (not TS)
**Qaror:** `apps/backend/scripts/seed.js` — plain CommonJS. `prisma:seed` skript orqali ishga tushadi.

**Sabab:** ts-node monorepo tsconfig'i bilan konflikt qildi (`moduleResolution must be set to NodeNext`). One-shot skript uchun TS qatlami chiqarib tashlandi — qiymat-narx nisbati past. Seed Prisma client va argon2 ni to'g'ridan-to'g'ri ishlatadi.

---

## §13. Default super-admin credentials — dev only
**Qaror:** Seed default email `admin@acoustic.local`, parol `ChangeMe!2026`. `SUPERADMIN_EMAIL` va `SUPERADMIN_PASSWORD` env orqali override qilinadi.

**Sabab:** Lokal dev'ni boshlash uchun bo'sh seed bo'lishi kerak. **Prod muhitda majburiy override**: deploy skriptida `SUPERADMIN_PASSWORD` set bo'lmasa, build to'xtaydi (M11 da implementatsiya). Hozircha PROGRESS.md ochiq savollarda eslatma bor.

---

## §14. JWT — two-secret access+refresh design
**Qaror:** Access token `JWT_ACCESS_SECRET` bilan imzolanadi (15 min default), refresh token `JWT_REFRESH_SECRET` bilan (7 kun default). Refresh tokenlar payload'i `{ sub, tokenType: "refresh" }` — minimal.

**Sabab:** Ikki sirning afzalliklari: agar access secret kompromiss bo'lsa, refresh tokenlar saqlanadi va inverse. Token rotation M11 da (refresh token DB jadvali bilan).

---

## §15. Prisma extension via `$allOperations`
**Qaror:** Bir umumiy `$allOperations` hook orqali barcha tenant-scoped modellar uchun yagona kod yo'li. `findUnique` ga ham injectsion qiladi (Prisma 5 da bu unique-only emas qabul qilinadi). Service qatlami tenant-scoped lookups uchun `findFirst({ id, ... })` ishlatishi kerak — `findUnique({ id })` IDga ko'ra ishlasada, extension all-purpose; defense-in-depth uchun barchasini `findFirst` ga aylantirish maslahat.

**Sabab:** Bitta umumiy hook 16 ta model uchun takror kodni qisqartiradi. `$allOperations` Prisma 5+ da rasmiy API. CardTag, Transcript, Analysis, QAScore — `tenantId` ustuni yo'q, lekin parent (Card/Call) orqali izolyatsiya. Ular uchun extension hech narsa qilmaydi; service qatlami parent'ni avval tekshiradi.

---

## §16. CLS — request context propagation
**Qaror:** `nestjs-cls` (AsyncLocalStorage wrapper) per-so'rov kontekstni boshqaradi. JwtStrategy `validate()` ichida `writeContext()` chaqiriladi — bu Prisma extension uchun tenantId beradi.

**Sabab:** Express middleware/guard zanjirida konteksni o'tkazish standart muammo. `nestjs-cls` zamonaviy, sinovdan o'tgan kutubxona. AsyncLocalStorage Node 18+ da barqaror. Test'da ham bevosita `cls.run(...)` orqali kontekst yaratish oson.

---

## §17. Webhook authentication via `Tenant.settings.webhookSecret`
**Qaror:** Public lead intake URL: `POST /api/v1/leads/webhook/:tenantId/:source` + `X-Webhook-Secret` header. Secret tenant yaratilganda `crypto.randomBytes(24).toString("hex")` orqali generatsiya qilinadi va `Tenant.settings.webhookSecret` JSON ustunida saqlanadi. `getWebhookSecret(tenantId)` faqat ACTIVE tenantlar uchun ishlaydi.

**Sabab:** Webhook ishonchli IP'lardan kelmasligini bilamiz (FB, IG, sayt). Tenant boshiga noyob sir — to'g'ridan-to'g'ri JWT'siz ishonchli. `Tenant.settings` JSON yangi migration talab qilmaydi, sxemaga moslashuvchi. Rotation M5/M11 da `POST /tenants/:id/regenerate-webhook` (tenant-admin) orqali ulanadi.

---

## §18. Default Pipeline seeded per tenant — M2
**Qaror:** Har yangi tenant yaratilganda default `Sotuv` pipeline (5 stage: Yangi → Bog'lanildi → Taklif yuborildi → Yutdi (WON) → Yo'qotdi (LOST)) avtomatik seed qilinadi. Adminlar M3 da boshqarishi mumkin.

**Sabab:** M2 ning lead-accept oqimi Card yaratish uchun pipeline+stage talab qiladi. Bo'sh tenant'da har bir lead-accept 400 berishi yomon UX. Default pipeline tenant onboarding'ni "shu yerda boshlang" tezligida qiladi. Asl AmoCRM ham xuddi shunday yondashadi.

---

## §19. Phone normalization rules
**Qaror:** `normalizePhone(input)` ko'p formatda kiritilgan telefonlarni kanonik `+998901234567` shakliga keltiradi:
- `+` bilan boshlansa, `+` saqlab, qolgan barcha non-digit'ni o'chiradi
- `998` bilan boshlansa, `+` qo'shadi
- 9 raqamli mahalliy raqam bo'lsa, `+998` prefiks
- Boshqa hollarda raqamlarni qoldirib `+` qo'shadi

**Sabab:** Dublikat tekshiruvi uchun bir xil raqamning turli ko'rinishlari (`+998 90 123 45 67` vs `998901234567`) bir xil hash bo'lishi shart. Strict E.164 emas — Uzbek tilida pragmatik. M2 testi 4 ta input variantni bir xil kanonik formatga keltirayotganini tasdiqlaydi.

---

## §20. Socket.io tenant-scoped rooms — M3
**Qaror:** Har socket.io ulanish JWT handshake'dan keyin `tenant:{tenantId}` xonasiga qo'shiladi. Backend faqat `realtime.toTenant(tenantId, event, payload)` orqali emit qiladi — `server.to(room).emit(...)`. Cross-tenant leak yo'q.

**Sabab:** Multi-tenant izolyatsiya HTTP qatlamida Prisma extension orqali kuchaytirilgan; socket layer'da xuddi shu mantiqni room bilan amalga oshiramiz. Default room (barchaga emit) hech qachon ishlatilmaydi — kod konventsiyasi.

---

## §21. CardsModule explicit broadcasts (no Prisma hooks) — M3
**Qaror:** Card create/update/move uchun `RealtimeService` qo'lda chaqiriladi. Prisma "after save" hook ishlatilmaydi.

**Sabab:** Prisma hook'lar muvozanatlanmagan (tranzaksiya orqali ham issue qilishi mumkin va event'lar transaction commit'idan oldin chiqishi mumkin). Service qatlamida explicit `realtime.toTenant(...)` chaqiruvi audit-friendly va kuzatish oson.

---

## §22. dnd-kit + react-query — frontend stack uchun M3
**Qaror:** Kanban DnD `@dnd-kit/core` (sortable kelajakda ustun ichi tartibga keladi); server holati `@tanstack/react-query` orqali boshqariladi (cache + invalidation). Lokal UI holati useState — Zustand'siz.

**Sabab:** dnd-kit a11y va touch'ni sanoatda eng yaxshi qo'llab-quvvatlaydi. react-query CRM uchun ideal — server-state cache, retry, invalidation barcha qoshilgan. Zustand keraksiz qo'shimcha qatlam — react-query + useState yetadi.

---

## §23. JWT decoded in browser (no roundtrip on init) — M3
**Qaror:** Frontend startup'da localStorage'dagi JWT'ni base64 decode qilib user payload'ni darhol oladi. `/auth/me` faqat login'da bir marta chaqiriladi (validatsiya uchun).

**Sabab:** Page reload'da har safar /auth/me chaqirish ortiqcha latensiya. JWT signature tekshirilmaydi clientda — backend har request'da tekshiradi. localStorage muddati o'tgan tokenni saqlasa, birinchi API chaqiruvi 401 oladi va interceptor /login ga yo'naltiradi.

---

## §24. Domain events via @nestjs/event-emitter — M4
**Qaror:** Trigger oqimi NestJS'ning ichki `EventEmitter2` orqali implementatsiya qilinadi (sinxron emit, lekin handlerlar async). Triggerlar uchun BullMQ navbati hozircha yo'q — `card.move`/`tag.attach` HTTP javobi tezda qaytadi va trigger ishi background'da yuradi.

**Sabab:** BullMQ qo'shilsa qo'shimcha infra (Redis ulanishi worker) M4 da hozirgi ehtiyojdan oshib ketadi. Trigger actions DB operatsiyalari — agar fail bo'lsa, log + skip. Retry siyosati keyinroq (BullMQ M11 ga rejalashtirilgan), shu vaqtda action turlari ko'paygach qayta ko'rib chiqamiz. Test'larda lifecycle uchun `moduleRef.init()` chaqirish kerak (EventSubscribersLoader onApplicationBootstrap'da ishlaydi).

---

## §25. SMS adapter pattern (Eskiz + Play Mobile + Mock) — M5
**Qaror:** `SmsAdapter` interfeysi 3 implementatsiya bilan. `SmsAdapterFactory` Tenant.settings.smsConfig.provider bo'yicha tanlaydi (default: mock). Har adapter o'z `send()` ichida HTTP chaqiruvi qiladi (Eskiz: token cache, Play: basic auth).

**Sabab:** CLAUDE.md §2/§5.5 adapter pattern majburiy. Mock — testlar va dev fallback; har tenant CRM ichidan o'z provayderini sozlaydi (M11'da SettingsPage). Adapter inputlarida `phone+text`, output `status+providerMessageId+errorMessage` — kichik kontrakt.

---

## §26. SMS template variables `{ism}/{sana}/{summa}` — M5
**Qaror:** Mini interpolation engine (`template.ts`) — faqat `{key}` placeholderlarni almashtiradi. Noma'lum kalitlar buzilmaydi (qo'lda topish oson). Trigger SMS uchun avtomatik vars: `ism` (contact.fullName), `sana` (locale uz-UZ), `summa`/`budget` (card.budget), `phone`.

**Sabab:** Mustahkam template engine (Handlebars/Liquid) kerakli emas — SMS qisqa, mantiq yo'q. Yengil regex `{(\w+)\}` xavfsiz va o'qiladigan. Qachondir loop/conditional kerak bo'lsa, Liquid ga ko'tarish oson.

---

## §27. SMS rate limit — in-memory, 60s oyna — M5
**Qaror:** `SmsRateLimiter` — Map bilan timestamp arraylar. Per-phone 3/60s (anti-spam), per-tenant 60/60s (anti-abuse). Multi-instance prod'da Redis backed bo'lishi kerak.

**Sabab:** CLAUDE.md §5.5 "Spam/limit himoyasi". Eskiz va Play providerlar o'zlarining limitlariga ega; bizniki birinchi himoya qatlami — bir foydalanuvchi tasodifan loop yoki bot xato qilsa, biz darhol to'xtatamiz. M11'da multi-instance bo'lsa Redis ga ko'chamiz.

---

## §28. SMS Webhook auth deferred to M11
**Qaror:** `/sms/webhook/:tenantId/:provider` hozircha secret tekshirmaydi. Provider'lar message_id ni qaytarib yuboradi — biz unga qarab logni topamiz. Bad actor ham bizning providerMessageId ni topa olmasligi kerak.

**Sabab:** Eskiz/Play webhook konfiguratsiyasi har biriga turlicha (HMAC, IP allowlist, shared secret). M5'da to'liq oqim ishlashi muhim; webhook auth M11 prod-hardening da qo'shiladi.

---

## §29. GIN index on `Contact.phones` deferred
**Qaror:** Prisma'da `String[]` ustun uchun GIN index sintaksisi preview-feature, M0 da `@@index([tenantId])` + `@@index([tenantId, email])` qoldirildi. Telefon bo'yicha tezkor qidiruv kerak bo'lsa (M9 da), GIN index'ni raw SQL migration orqali qo'shamiz.

**Sabab:** Loyihaning birinchi migratsiyasini sodda saqlash; M3 da kichik tenantlar uchun btree+hasSome yetarli. Million qator chegarasida qayta ko'rib chiqamiz.

---

## §30. Telephony-worker — alohida ish jarayoni + interface — M6
**Qaror:** AMI integratsiyasi alohida workspace paketi `apps/telephony-worker`. Backend bilan ikki yo'nalishli HTTP orqali aloqada bo'ladi:
- Backend → Worker: `POST /worker/originate` (click-to-call)
- Worker → Backend: `POST /api/v1/internal/calls/{incoming,completed}`

Ikkala yo'nalish ham `X-Worker-Secret` (shared `TELEPHONY_WORKER_SECRET` env) bilan autentifikatsiyalanadi. `AmiClient` interfeysi 2 implementatsiya: `MockAmiClient` (dev/test) va `AsteriskAmiClient` skeleton (prod uchun M11 da to'ldiriladi).

**Sabab:** Asterisk AMI ulanish doimiy TCP socket — uni NestJS HTTP server bilan birlashtirib qo'yish (a) lifecycle riski oshiradi, (b) reconnect logika monolit'ni murakkablashtiradi, (c) PBX yaqinida bo'lishi mumkin (geografik). Alohida worker — boshqa kuzatuv, deploy va xato izolyatsiyasi. Interface-first design bilan mock va prod kodi bir xil pipeline'dan o'tadi — testlar real-world bilan paralel.

---

## §31. Calls upsert by (tenantId, cdrUniqueId) — idempotent worker — M6
**Qaror:** `CallsService.completed` `prisma.t.call.upsert` ishlatadi `@@unique([tenantId, cdrUniqueId])` constraint orqali. Worker xato bo'lib qaytib yuborsa (HTTP retry, qayta ulanish), dublikat yozuv chiqmaydi.

**Sabab:** AMI hangup eventi telefoniya tomonidan retry bo'lishi mumkin (worker reconnect, queued requests). Idempotency cdrUniqueId orqali tabiiy — Asterisk har bir kanalga noyob id beradi. Status/duration update qiladi (oxirgi ma'lumot to'g'ri).

---

## §32. MISSED → callback Task auto-create — M6
**Qaror:** Inbound MISSED bo'lsa, `Task` yaratiladi: `type=CALL`, `dueAt = now + 1h`, `assigneeId = operator || responsible || firstAdmin`. Text "qayta qo'ng'iroq qiling" prefiksi bilan.

**Sabab:** Mijoz raqami bilan callback qilish — call-markazning eng yuqori konvertatsiya signali. Avtomatik task call-markaz menejerlariga ko'rsatadi: "bu mijoz javob olmadi — bugun zarur". CLAUDE.md §5.4 da aniq belgilangan. 1 soatlik dueAt — mijoz hali "issiq" bo'lganda.

---

## §33. Real Asterisk integration deferred to M11
**Qaror:** `AsteriskAmiClient` interfaceni implement qiladi, lekin `connect()` chaqiruvi xato beradi ("not implemented in M6 skeleton"). Real AMI ulanish M11 deploy-hardeningda `asterisk-manager` npm paketi bilan qo'shiladi.

**Sabab:** M6 talabini "agar real PBX mavjud bo'lmasa, mock simulator drive qiladi, lekin interfeys real ulanishga tayyor" deb yopdi. Customer PBX'lari turlicha (FreePBX/Asterisk versiyalari, contexts, trunks). Real implementatsiya CRM'ni mijoz yaqiniga deploy qilish vaqtida tenant-config bilan birga sozlanadi.

---

## §34. Frontend screen-pop — fixed toast + deep-link — M6
**Qaror:** Inbound qo'ng'iroq kelganda `IncomingCallToast` (fixed-position, bottom-right) ko'rinadi. Kontakt nomi, telefon, mos karta + "Kartani ochish" tugmasi. 30 sekundda auto-dismiss. `AppLayout` ichida har sahifada mount.

**Sabab:** Modal overlay operator ishini to'sib qo'yadi — toast esa fonda ish davom etadi. Modal real screen-pop M11 da brauzer notification API + sound bilan qo'shilishi mumkin. "Kartani ochish" hozir tegishli Kanban sahifaga deep-link qiladi (M9 da to'liq routing).

---

## §35. STT pipeline — BullMQ + ai-worker, optional in tests — M7
**Qaror:** Call recordingUrl bilan tugagach backend `CallsService.completed` STT job ni BullMQ navbatiga qo'shadi. `apps/ai-worker` workspace alohida `Worker` sifatida queueni iste'mol qiladi va `POST /internal/transcripts` orqali backend'ga yozadi. `BULLMQ_DISABLED=1` env testlar va Redis bo'lmagan dev uchun no-op `.add()` provider beradi (Optional injection bilan CallsService SttQueue siz ham ishlaydi).

**Sabab:** CLAUDE.md §4 "Asinxron og'ir vazifalar BullMQ navbati orqali ai-worker da". Transcripts'ni HTTP response chizig'iga qo'shish call POST'ni sekinlashtiradi va STT xato bo'lsa yozuvni butunlay yo'qotamiz. Queue retry + alohida worker xato izolyatsiyasi va horizontal scaling beradi. Optional injection bilan testlar bo'sh Redis muhitida ham ishlaydi.

---

## §36. STT adapter — Mock to'liq, Whisper skeleton — M7
**Qaror:** `SttAdapter` interfeysi 2 implementatsiya bilan. `MockSttAdapter` deterministik 7-segmentli operator/customer dialogini chiqaradi (Acoustic'ga xos intake skripti, uz tili). `WhisperSttAdapter` (OpenAI whisper-compatible) interface'ni satisfy qiladi lekin `transcribe()` xato beradi — M11 da diarization (pyannote) bilan to'ldiriladi.

**Sabab:** M7 talabini "ishlaydigan uz/ru STT" deb yopdi — mock tilni hurmat qiladi va M8 QA pipeline'ini sinov uchun yetarli sifat va format beradi. Whisper-ga to'g'ridan-to'g'ri ulanish testlarda flaky (network, kvota) — interface yetarli prototip. Real diarization (operator/customer ajratish) audio kanal asosida (stereo: chap=operator) M11 da real recordings bilan baholanadi.

---

## §37. Transcript callId @unique → upsert semantikasi — M7
**Qaror:** `TranscriptsService.write` `prisma.transcript.upsert({ where: { callId }, ... })` — bir call uchun bir transcript. AI-worker retry/replay xavfsiz: oxirgi yozuv g'olib. Tenant cross-check: TranscriptsService write'dan oldin `call.tenantId === dto.tenantId` ekanligini tasdiqlaydi (worker tomonidagi misconfig'ga qarshi DiD).

**Sabab:** Schema `Transcript.callId @unique` ekan, ikkala constraint birgalikda bizga "transcript = call'ning oxirgi STT chiqishi" semantikasini beradi. STT qayta ishlanishi (yaxshilangan adapter bilan) eski transcript'ni almashtiradi — versioning hozir kerak emas (M11 da audit log baholaydi).

---

## §38. LLM adapter + queue payload-carries-context — M8
**Qaror:** `LlmAdapter` interfeysi `analyze(transcript)` va `grade(transcript, criteria)` ikki metodga ega. AI_ANALYSIS va QA BullMQ navbatlari **payload ichida transcript va criteria** bilan ishlatiladi — worker backend'dan qo'shimcha o'qish chaqirig'i qilmaydi.

**Sabab:** Worker uchun backend'da read-endpoint qo'shish — bir nechta yangi guard/RBAC sirt. Payload kontekstli — pipeline atomic (transcript va criteria birga keladi), retry idempotent (payload o'zgarmaydi), HTTP roundtrip kamayadi. Trade-off: payload kattaroq (transcript bir necha KB) — Redis uchun sezilarli emas. Million qator bo'lsa o'lcham chegarasiga qaytib qaraymiz.

---

## §39. Mock LLM keyword-based grading — deterministik testlar — M8
**Qaror:** `MockLlmAdapter.grade()` har mezon `keywords[]` array (yoki `text` ning long words) ni substring sifatida transcript segmentlarda izlaydi. Topsa → `passed=true, score=maxScore, evidence=segment qatori`. Topmasa → `passed=false, score=0`.

**Sabab:** M8 talabi "barqaror, dalil bilan asoslangan natija". Real LLM stoxastik — testlar flaky bo'lishi mumkin. Mock keyword-grading ishonchli reproducible va prod'da bir xil JSON shape qaytaradi. M11 da Claude bilan parallel test'lar (snapshot tolerance) qo'shamiz. Keywords array Script.criteria DTO da optional — admin sets it through the UI when creating a rubric.

---

## §40. Prompts versioned in `prompts/` directory — M8
**Qaror:** LLM promptlari `prompts/<purpose>.v<N>.md` formatida saqlanadi (markdown). `prompts/analysis.v1.md` va `prompts/qa-grade.v1.md` — JSON-only output sxemasi va xavfsizlik qoidalari (**tibbiy maslahat berma**) bilan. Real adapter `loadPrompt()` orqali o'qiydi.

**Sabab:** Promptlar produktning core business logic'i. Markdown versiya — diff-readable, code review oson, version control bilan o'zgarishlar kuzatiladi. Yangi prompt versiyasi `.v2.md` deb qo'shiladi — eski versiya saqlanadi (rollback uchun). Adapter qaysi versiyani ishlatishi config'da belgilanadi.

---

## §41. QAScore upsert by (callId, scriptId) — manual lookup — M8
**Qaror:** Schema'da `QAScore.@@unique([callId, scriptId])` constraint yo'q (CLAUDE.md §5.1'da kelishilgan). Service qatlamida `findFirst` + `update`/`create` orqali idempotent retry'ni qo'lda majburlanadi.

**Sabab:** QAScore ko'p script bilan tirikan (har Script bir QAScore) — composite unique bo'lsa, future bir nechta script versiyalari uchun qiyinchilik bo'lardi. Manual lookup oddiy, audit trail ham ko'rinarli. Race condition risk — bir vaqtda ikki worker bir xil (callId, scriptId) ga yozsa, ikkala ham create — keyin admin bittasini o'chiradi. Hozircha bu yopilmagan (M11'da QAScore'ga unique constraint qo'shish ko'rib chiqiladi).

---

## §42. Analytics aggregation in app layer — M9
**Qaror:** Operator KPI / weakest-criteria / trends Prisma queries + TypeScript reduce. JSON criteriaResults arraylari Postgres jsonb_array_elements bilan emas, balki application'da iteratsiya qilinadi.

**Sabab:** M9 da kichik-o'rta tenantlar uchun bu yetarli. Raw SQL JSON unnesting Prisma type safety'ni buzadi. Million+ scale bo'lsa materialized view yoki agregat jadvallar (M11) ko'rib chiqiladi.

---

## §43. Recharts for dashboard — M9
**Qaror:** Frontend grafikalari uchun `recharts`. KPI tile'lar shadcn-uslubli cardlar; line/bar/pie chart'lar recharts.

**Sabab:** Recharts React-native va deklarativ — shadcn/Tailwind UI bilan oson mos keladi. Bundle 891 kB (264 kB gzip) — bir vaqtda yuklash hozir maqbul. M11'da `manualChunks` orqali charts alohida chunk'ga ajratiladi.

---

## §44. Operator-scoping in analytics — M9
**Qaror:** `/analytics/operator-kpi` va `/trends` operator role uchun `query.userId` ni majburiy `user.sub` ga override qiladi. SUPERVISOR/ANALYST istalgan operator KPI ko'ra oladi.

**Sabab:** Operator boshqa hamkasbining KPI'sini ko'rmasligi kerak. Bu controller qatlamida; service tomondan `userId` qabul qiladi, RBAC yuqorida.

---

## §45. Sensitivity guardrails — never auto-send medical/pricing/legal — M10
**Qaror:** `detectSensitiveCategories(text)` o'zbek+rus regex'lari medical/pricing/legal kategoriyalarni aniqlaydi. Webhook ingest paytida ham customer inputi, ham AI draft tekshiriladi — agar topilsa, status=`NEEDS_REVIEW` va auto-send butunlay bloklanadi. AuditLog `inbox.draft.created` yozuvida `autoSendBlocked: true` flag bor.

Operator drafni tahrirlasa va approve qilsa, **qayta sensitivity tekshiriladi** — agar operator chegirma yoki yuridik gap kiritgan bo'lsa, sensitivity tag'i SENT xabarda qoladi (audit visibility uchun). Operator sensitive matnni yuborishi MUMKIN — lekin har doim insonni javobgar qiladi.

**Sabab:** CLAUDE.md §5.10: "Tibbiy/narx/yuridik javoblar HECH QACHON avtomatik yuborilmaydi." Acoustic kabi tibbiy biznesda noto'g'ri auto-reply kompaniya uchun reputatsiya va yuridik tahdid. Regex false positive operator review = 5 sekund yo'qotish; false negative auto-send = potentsial 5-figure xato. Trade-off aniq tarzda safety tomonga.

---

## §46. Inbox schema added via migration — extends §5.1 — M10
**Qaror:** `InboxThread` va `InboxMessage` modellari `prisma/migrations/20260528013941_add_inbox/` migration orqali qo'shildi. CLAUDE.md §5.1 ushbu modellarni keltirmagan, ammo §5.10 Faza 2 omnichannel inbox uchun kerakli.

**Sabab:** §5.1 dagi mavjud modellar (Lead, Contact, AuditLog) inbox tarixini saqlash uchun mos kelmaydi — channel-specific external IDs va sensitivity flags zarur. Yangi migration `Tenant.users[]` qatorida `inboxThreads + inboxMessages` qo'shadi (cascade soft-delete). Schema CLAUDE.md ga moslik buzilmagan — §5.1 minimal core entitlar ro'yxati edi.

---

## §47. Real Graph API integration deferred to M11
**Qaror:** Webhook payload `InboxWebhookDto` Instagram/Facebook Graph API'dan keladigan ma'lumotni qabul qilish uchun, lekin signature verification va Graph API ga send chaqiruvi M11 da. `approveDraft` hozir status=`SENT` qiladi lekin tashqi API chaqirmaydi.

**Sabab:** Graph API ulashish uchun Meta dev portali ro'yxatdan o'tish, Page Access Token, webhook URL HTTPS, App-secret signature va boshqa konfiguratsiya kerak. M10 oqim arxitekturasini va xavfsizlik qatlamini tasdiqladi (regex guardrails, AuditLog, state machine). M11 da real integratsiya — interface'lar tayyor, faqat sirtqi HTTP klient qo'shiladi.
