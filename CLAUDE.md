# CLAUDE.md — AI Call-Center CRM (Loyiha konteksti va qurish yo'riqnomasi)

> Bu fayl loyihaning bosh konteksti. Claude Code va Codex har sessiya boshida buni TO'LIQ o'qiydi. Bu yerda butun mahsulot, har bo'limning qanday ishlashi, qurish tartibi va qoidalar bor.

---

## 0. ASOSIY QOIDALAR (har doim amal qil)

1. **Avtonomiya:** Har kichik qadam uchun ruxsat SO'RAMA. O'zing qaror qil, bajar, davom et. Faqat `/goal` da belgilangan milestone tugaganda to'xta.
2. **Noaniqlik:** Savol tug'ilsa — eng mantiqiy, sanoat standartiga mos qarorni qabul qil, `DECISIONS.md` ga yoz, davom et. To'xtab so'rama.
3. **Hech narsani yarim qoldirma.** Har funksiya TO'LIQ ishlanadi (frontend + backend + test).
4. **Git:** Har milestone (yoki katta bo'lak) oxirida `commit` + `push`. Push'dan oldin `build`+`lint`+`test` o'tsin.
5. **PROGRESS.md** ni har push'dan oldin yangila (handoff uchun — 14-bo'limga qara).
6. **Multi-tenant izolyatsiya** hech qachon buzilmaydi. Har so'rov `tenantId` bo'yicha filtrlanadi.
7. **TypeScript strict.** `any` ishlatma. Umumiy tiplar `packages/shared` da.
8. **Til:** Interfeys o'zbek (asosiy), rus, ingliz (i18n). Kod izohlar inglizcha.

---

## 1. MAHSULOT NIMA

O'zbekiston call-markazlari uchun **multi-tenant SaaS CRM**. AmoCRM/Bitrix24 ga o'xshash Kanban tizimi, LEKIN:
- Ortiqcha modul yo'q (ombor, HR, sayt qurish yo'q) — faqat call-markazga kerakli funksiyalar.
- **O'zbek tilida AI suhbat tahlili va sifat nazorati (QA)** — bu asosiy farqlovchi xususiyat.
- Telefoniya tashqi **FreePBX** (Asterisk) dan keladi, CRM uni qabul qiladi va qayta ishlaydi.

**Asosiy g'oya — AmoCRM uslubidagi Kanban:** Har bir mijoz/lead = **karta** (deal). Karta voronkadagi bosqichlar (ustunlar) bo'ylab harakatlanadi. Har kartada: kontakt, **teglar**, vazifalar, izohlar, **kirish/chiqish qo'ng'iroqlar tarixi**, SMS tarixi, AI tahlil natijasi. Bosqich o'zgarganda yoki teg qo'shilganda **triggerlar** ishlaydi (masalan, SMS yuborish).

---

## 2. TEXNOLOGIK STEK (qat'iy, chetga chiqma)

| Qatlam | Texnologiya |
|---|---|
| Monorepo | pnpm workspaces (yoki Turborepo) |
| Backend | NestJS (TypeScript) |
| ORM | Prisma |
| DB | PostgreSQL |
| Navbat | BullMQ + Redis |
| Frontend | React + Vite + TypeScript |
| UI | shadcn/ui + Tailwind |
| Kanban DnD | @dnd-kit/core (drag-and-drop) |
| Real-time | Socket.io |
| Fayl saqlash | MinIO (S3-mos) |
| Telefoniya | FreePBX/Asterisk — AMI + CDR + yozuv fayllari |
| STT | Adapter pattern (provayder almashtiriladigan) |
| LLM | Adapter pattern (provayder almashtiriladigan) |
| SMS | Eskiz.uz + Play Mobile (adapter pattern) |
| Konteyner | Docker + Docker Compose |
| Proxy | Nginx |

---

## 3. MONOREPO STRUKTURASI

```
/
├── apps/
│   ├── backend/            # NestJS API
│   ├── frontend/           # React + Vite
│   ├── telephony-worker/   # FreePBX/AMI konnektori
│   └── ai-worker/          # STT + LLM tahlil (BullMQ consumer)
├── packages/
│   └── shared/             # Umumiy tiplar, DTO, enum, konstanta
├── prisma/                 # schema.prisma, migratsiyalar, seed
├── docker-compose.yml
├── docker-compose.prod.yml
├── .env.example
├── CLAUDE.md               # bu fayl
├── PROGRESS.md             # handoff holati
├── DECISIONS.md            # qabul qilingan qarorlar
└── README.md
```

---

## 4. ARXITEKTURA TALABLARI

- **Modulli monolit** (backend): har modul alohida NestJS module (auth, tenants, contacts, leads, pipelines, cards, tags, tasks, calls, sms, triggers, qa, analytics, inbox).
- **Multi-tenant:** Yagona DB, har jadval `tenantId` ustuni bilan. Prisma Client Extension (yoki middleware) orqali har so'rov avtomatik `tenantId` filtrlanadi. Izolyatsiya API guard darajasida ham majburlanadi.
- **Adapter pattern** — STT, LLM, SMS uchun interfeys + implementatsiya. Implementatsiya almashtiriladigan bo'lsin.
- **Asinxron og'ir vazifalar** (transkripsiya, AI tahlil) — BullMQ navbati orqali `ai-worker` da.
- **Real-time** — yangi qo'ng'iroq, karta ko'chishi, yangi xabar Socket.io orqali jonli yangilanadi.
- **Validatsiya** — har endpoint `class-validator` / `zod` DTO bilan.
- **Xato boshqaruvi** — global exception filter, structured logging.
- **Test** — biznes-logika uchun unit test; QA baholash va multi-tenant izolyatsiya uchun MAJBURIY test.

---

## 5. MODULLAR — HAR BIRI QANDAY ISHLASHI KERAK

Bu eng muhim bo'lim. Har modul AmoCRM mantig'iga o'xshash, lekin call-markaz va AI/QA uchun moslangan.

### 5.1. Ma'lumotlar modeli (Prisma — asosiy entitilar)

Barchasida (Tenant'dan tashqari): `id`, `tenantId`, `createdAt`, `updatedAt`. Soft-delete uchun `deletedAt`.

- **Tenant** — nom, settings(Json), status, defaultLanguage, freePbxConfig(Json), smsConfig(Json)
- **User** — tenantId, fullName, email, passwordHash, role(enum), branchId?, status, isOnline
- **Branch** — tenantId, name (filial — Acoustic uchun 22+ filial)
- **Contact** — tenantId, fullName, phones(String[]), email?, source, customFields(Json), responsibleUserId?
- **Pipeline** — tenantId, name, isDefault, order
- **Stage** — pipelineId, tenantId, name, order, color, type(enum: NORMAL | WON | LOST), autoActions(Json?)
- **Card** (= AmoCRM "deal") — tenantId, pipelineId, stageId, contactId, title, budget?, responsibleUserId?, branchId?, dueDate?, enteredStageAt, status(enum: OPEN | WON | LOST), lostReason?
- **Tag** — tenantId, name, color
- **CardTag** — cardId, tagId (many-to-many; teglar kartaga biriktiriladi)
- **Task** — tenantId, cardId?, contactId?, assigneeId, type(enum: CALL | MEETING | FOLLOWUP | CUSTOM), text, dueAt, completedAt?, result?
- **Call** — tenantId, contactId?, cardId?, operatorId?, direction(enum: INBOUND | OUTBOUND), fromNumber, toNumber, status(enum: ANSWERED | MISSED | BUSY | FAILED), startedAt, duration, recordingUrl?, cdrUniqueId
- **Transcript** — callId, text, segments(Json:[{speaker,start,end,text}]), language, confidence
- **Analysis** — callId, sentiment, topic, summary, nextStep, keyPoints(Json), scriptId?
- **Script** — tenantId, name, sections(Json), criteria(Json:[{id,section,text,maxScore}]), isActive
- **QAScore** — callId, scriptId, totalScore, maxScore, criteriaResults(Json:[{criterionId,passed,score,evidence}]), supervisorOverride(Json?), reviewedBy?
- **SmsTemplate** — tenantId, name, body (o'zgaruvchilar: {ism},{sana},{summa})
- **SmsLog** — tenantId, contactId?, cardId?, templateId?, phone, text, provider, status(enum: QUEUED|SENT|DELIVERED|FAILED), providerMessageId?, sentAt?
- **Lead** — tenantId, source, rawData(Json), status(enum: UNSORTED|ACCEPTED|REJECTED), contactId?, cardId?
- **Trigger** — tenantId, pipelineId?, name, event(Json), conditions(Json), actions(Json), isActive
- **Note** — tenantId, cardId?, contactId?, authorId, text (izohlar/kommentariyalar)
- **AuditLog** — tenantId, userId, action, entityType, entityId, details(Json)

Rollar (enum): `SUPER_ADMIN`, `TENANT_ADMIN`, `SUPERVISOR`, `OPERATOR`, `ANALYST`.

### 5.2. KANBAN (yadro modul — AmoCRM uslubida)

Bu tizimning markaziy ekrani. Operatorlar kun bo'yi shu yerda ishlaydi.

**Tuzilishi:**
- Bir nechta **Pipeline** (voronka): masalan "Sotuv", "Qo'llab-quvvatlash", "Qayta qo'ng'iroq".
- Har pipeline'da sozlanadigan **Stage** lar (ustunlar), tartib va rang bilan. Maxsus tur: WON (yutuq) va LOST (yo'qotish) ustunlari.
- Har bir **Card** bitta ustunda turadi. Karta = bitta mijoz bilan ish jarayoni (deal).

**Karta ko'rinishi (Kanban'da):**
- Mijoz ismi + telefon
- Teglar (rangli yorliqlar)
- Mas'ul operator (avatar)
- Oxirgi qo'ng'iroq belgisi (kirish/chiqish ikonkasi + AI ball, agar bo'lsa)
- Faol vazifa muddati (qizil agar o'tib ketgan)
- Budjet (ixtiyoriy)
- Bosqichda turgan vaqt

**Funksionallik:**
- **Drag-and-drop** (@dnd-kit) — kartani ustundan ustunga sudrash. Ko'chganda `stageId` va `enteredStageAt` yangilanadi, triggerlar tekshiriladi, AuditLog yoziladi, Socket.io orqali boshqa foydalanuvchilarga jonli yangilanadi.
- **Filtrlar:** teg bo'yicha, mas'ul bo'yicha, filial bo'yicha, manba bo'yicha, sana oralig'i, AI ball oralig'i.
- **Qidiruv:** ism/telefon bo'yicha tez qidiruv.
- **Karta ochilganda** (detal panel/modal): kontakt ma'lumoti, teglar (qo'shish/olib tashlash), vazifalar, izohlar, **qo'ng'iroqlar tarixi** (har biri AI tahlil + QA ball bilan), **SMS tarixi**, va "SMS yuborish" / "Qo'ng'iroq qilish" (click-to-call) tugmalari.
- **Branch-based assignment:** kartalar filial va operatorlarga taqsimlanadi (Acoustic 22+ filial uchun).

### 5.3. TEGLAR (Tags — AmoCRM uslubida)

- Teglar tenant darajasida yaratiladi (nom + rang).
- Kartaga bir nechta teg biriktirish mumkin (CardTag).
- **Teglar bo'yicha filtrlash** Kanban'da.
- **Teg trigger'da ishlaydi:** teg qo'shilishi/olib tashlanishi trigger event bo'la oladi (masalan, "VIP" tegi qo'shilsa → mas'ulni o'zgartir; "to'lov_kutilmoqda" tegi qo'shilsa → SMS yubor).
- Teglarni AI ham qo'ya oladi (suhbat tahlilidan kelib chiqib avtomatik teg taklif qiladi, masalan "shikoyat", "qiziqish_yuqori").

### 5.4. QO'NG'IROQLAR (kirish va chiqish — Kanban bilan bog'liq)

Bu sizning asosiy talabingiz — qo'ng'iroqlar Kanban ichida ishlaydi.

**Kirish qo'ng'iroq (INBOUND):**
1. FreePBX qo'ng'iroqni qabul qiladi, AMI event keladi (`telephony-worker`).
2. Tizim raqam bo'yicha Contact'ni qidiradi:
   - Topilsa → operator ekranida **screen-pop** (Socket.io): mijoz kartasi avtomatik ochiladi.
   - Topilmasa → "yangi kontakt" taklifi, qo'ng'iroq tugagach yangi Lead/Card yaratish opsiyasi.
3. Qo'ng'iroq tugagach: Call yozuvi (direction=INBOUND), CDR va recordingUrl saqlanadi.
4. Agar mavjud Card bo'lsa — qo'ng'iroq o'sha kartaga biriktiriladi; bo'lmasa yangi karta yaratiladi (sozlamaga ko'ra).
5. Audio → `ai-worker` navbatiga → STT → AI tahlil + QA ball → kartaga biriktiriladi.

**Chiqish qo'ng'iroq (OUTBOUND):**
1. Operator kartadan **click-to-call** bosadi → AMI Originate orqali FreePBX qo'ng'iroq qiladi.
2. Qo'ng'iroq tugagach xuddi shu jarayon (Call yozuvi, recordingUrl, STT, AI/QA).

**Javobsiz qo'ng'iroq (MISSED):**
- Alohida belgilanadi, avtomatik "qayta qo'ng'iroq" Task yaratiladi va mas'ulga biriktiriladi.

**Kanban'da ko'rinishi:** har kartada qo'ng'iroqlar tarixi (kirish/chiqish ikonkalari, davomiyligi, AI ball). Filtr: "javobsiz qo'ng'iroqlar", "bugun qo'ng'iroq qilingan" va h.k.

### 5.5. SMS (Kanban va trigger bilan)

- **Adapter:** Eskiz.uz va Play Mobile (har tenant o'zinikini ulaydi).
- **Shablonlar** o'zgaruvchilar bilan: {ism}, {sana}, {summa} — yuborishda kontakt/karta ma'lumotidan to'ldiriladi.
- **Yuborish usullari:**
  - Operator kartadan qo'lda yuboradi (shablon tanlab yoki erkin matn).
  - **Trigger orqali avtomatik** (masalan, karta "Tasdiqlandi" bosqichiga o'tsa → tasdiq SMS).
- SMS tarixi har kartada va kontaktda ko'rinadi; delivery status kuzatiladi (webhook orqali).
- Spam/limit himoyasi: bir raqamga qisqa vaqtda ko'p SMS bloklanadi.

### 5.6. TRIGGERLAR (avtomatlashtirish yadrosi)

"Event → shartlar → harakatlar" qoidalari. AmoCRM "Digital Pipeline" ga o'xshash.

**Event (qachon):**
- Karta yangi bosqichga o'tdi (stage changed)
- Teg qo'shildi / olib tashlandi
- Yangi Card/Lead yaratildi
- Qo'ng'iroq tugadi (yoki MISSED)
- Vaqt o'tdi (karta bosqichda N kun harakatsiz)
- AI QA ball belgilangan chegaradan past/yuqori

**Shartlar (ixtiyoriy filtrlar):** manba, filial, mas'ul, teg mavjudligi, budjet oralig'i.

**Harakatlar (nima):**
- SMS yuborish (shablon bo'yicha)
- Task yaratish va mas'ulga biriktirish
- Kartani boshqa bosqich/mas'ul/pipeline ga ko'chirish
- Teg qo'shish/olib tashlash
- Webhook chaqirish (tashqi integratsiya)
- Telegram bildirishnoma (supervayzerga)

**Implementatsiya:** Trigger event'lar domain event sifatida chiqariladi, trigger-engine ularni tinglaydi, shartlarni tekshiradi, harakatlarni navbat orqali bajaradi (qayta urinish bilan).

### 5.7. LEAD'LAR (kirish manbalari)

- Sayt formasi / Facebook-Instagram lead form / target reklama → webhook/API orqali Lead yaratiladi (status=UNSORTED).
- "Unsorted" (saralanmagan) ro'yxat — operator qabul qiladi (ACCEPTED → Card yaratiladi) yoki rad etadi.
- Avtomatik taqsimot: manba/qoidaga ko'ra pipeline va operatorga biriktiriladi.
- Manba kuzatuvi: qaysi kanal qancha lead/konversiya berdi (analytics uchun).

### 5.8. AI SUHBAT TAHLILI + QA (asosiy farqlovchi — g'alaba yadrosi)

**STT:** Qo'ng'iroq audiosi → matn (o'zbek/rus). Operator va mijoz nutqi ajratiladi (kanal/diarization), timestamp bilan. Adapter orqali, confidence saqlanadi.

**AI tahlil:** Transcript → LLM:
- Sentiment (mijoz va operator kayfiyati)
- Mavzu/maqsad (sotuv, shikoyat, ma'lumot)
- Qisqa xulosa (summary)
- Keyingi qadam tavsiyasi
- Avtomatik teg taklifi

**QA baholash (yadro):** Script (bo'lim + mezon + ball) + Transcript → LLM har mezon bo'yicha `passed` + `score` + **dalil (transkriptdan iqtibos)** beradi. Umumiy ball 0-100. Supervayzer ko'rib chiqib tuzatishi mumkin (override). LLM prompt'lari `prompts/` da, versiyalanadi.

**Muhim:** Bu Acoustic kabi tibbiy biznesda — AI faqat **baholaydi va tahlil qiladi**, mijozga avtomatik tibbiy maslahat BERMAYDI.

### 5.9. DASHBOARD / KPI

- **Operator KPI:** qo'ng'iroqlar soni (kirish/chiqish), o'rtacha QA ball, konversiya %, o'rtacha davomiylik, sentiment %, skript rioya %.
- **Supervayzer:** jamoa/filial taqqoslash, eng zaif/kuchli mezonlar (coaching), vaqt bo'yicha dinamika.
- **Karta scorecard:** har qo'ng'iroq uchun batafsil baho (mezonlar, ballar, dalillar).

### 5.10. OMNICHANNEL INBOX + AUTO-JAVOB (Faza 2)

- Instagram/Facebook DM va comment qabul qilish (Graph API).
- AI javob **qoralamasi** tayyorlaydi → operator ko'radi, tahrirlaydi, tasdiqlaydi.
- Tibbiy/narx/yuridik javoblar HECH QACHON avtomatik yuborilmaydi. Hammasi audit'ga yoziladi.

---

## 6. RBAC (rollar va ruxsatlar)

| Rol | Ko'radi / qiladi |
|---|---|
| SUPER_ADMIN | Barcha tenantlar, tizim sozlamalari, billing |
| TENANT_ADMIN | O'z kompaniyasi to'liq: foydalanuvchilar, pipeline, teglar, skript, integratsiya sozlamalari |
| SUPERVISOR | Operatorlarni nazorat, QA ko'rish/tuzatish, hisobotlar, barcha kartalar |
| OPERATOR | O'z kartalari, qo'ng'iroqlari, vazifalari; faqat o'z filiali (sozlamaga ko'ra) |
| ANALYST | Faqat ko'rish: hisobotlar, dashboard |

Har muhim harakat AuditLog ga yoziladi. Ruxsatlar guard darajasida majburlanadi.

---

## 7. QURISH TARTIBI — MILESTONE'LAR

Ketma-ket qur. Har milestone — to'liq ishlaydigan bo'lak. Har biri oxirida git push + PROGRESS.md yangilash.

- **M0 — Poydevor:** monorepo, docker-compose (postgres/redis/minio/nginx), NestJS skelet, Prisma schema (5.1), birinchi migratsiya, React+Vite+shadcn skelet, health-check. `npm run build` ikkala app'da o'tadi.
- **M1 — Auth + Multi-tenant + RBAC:** JWT (access+refresh), argon2, Prisma tenant-filtr extension, 5 rol guard, AuditLog, tenant/user yaratish. **Test:** tenant izolyatsiya testi.
- **M2 — Kontaktlar + Lead'lar:** Contact CRUD/qidiruv/dublikat; Lead webhook (sayt/FB/IG), unsorted ro'yxat, qabul/rad, avtomatik taqsimot.
- **M3 — Kanban + Teglar (5.2, 5.3):** Pipeline/Stage CRUD, Card CRUD, drag-and-drop, karta detal panel, teglar (CRUD + biriktirish + filtr), Note/izohlar, Task. Socket.io jonli yangilanish. **Bu yadro — puxta ishlansin.**
- **M4 — Triggerlar (5.6):** event chiqarish, trigger-engine, shartlar, harakatlar (hozircha: stage ko'chirish, teg, task; SMS keyingi milestone'da ulanadi).
- **M5 — SMS (5.5):** Eskiz + Play adapter, shablonlar, qo'lda + triggerdan yuborish, delivery status, limit himoyasi. Trigger'ga SMS action ulanadi.
- **M6 — FreePBX telefoniya (5.4):** telephony-worker, AMI ulanish, CDR, recording olish, screen-pop (Socket.io), kontakt aniqlash, click-to-call, MISSED→task. Real PBX bo'lmasa mock/simulyator yoz, lekin interfeys real ulanishga tayyor.
- **M7 — STT:** ai-worker, STT adapter, audio→matn (uz/ru), speaker ajratish, BullMQ asinxron, transcript+confidence saqlash.
- **M8 — AI tahlil + QA (5.8):** LLM adapter, sentiment/topic/summary/nextStep/teg-taklif, QA baholash dvigateli (mezon+ball+dalil), supervayzer override, prompt'lar prompts/ da. **Test:** ma'lum transcript+script uchun barqaror baho.
- **M9 — Dashboard + KPI (5.9):** operator KPI, supervayzer ko'rinishi, scorecard, dinamika grafiklari.
- **M10 — Omnichannel inbox + auto-javob (5.10):** DM/comment qabul, AI qoralama, human-in-the-loop, audit.
- **M11 — Yakuniy:** prod docker-compose, Nginx+SSL, backup skript, Swagger, README, DECISIONS, Acoustic seed (1 tenant, namuna pipeline/skript/teglar), to'liq smoke-test (qo'ng'iroq→transcript→tahlil→QA→trigger→SMS).

---

## 8. GIT WORKFLOW (majburiy)

Har milestone (yoki katta bo'lak) oxirida:
```bash
git add -A
git commit -m "feat(milestone-N): <qisqa tavsif>"
git push origin main
```
- Conventional Commits: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`.
- Push'dan oldin `build`+`lint`+`test` o'tsin. Build buzuq kodni push qilma.
- `.gitignore`: node_modules, .env, dist, audio fayllar, *.log.
- Sirlar (.env, token, parol, audio) HECH QACHON commit qilinmaydi.
- Repo yo'q bo'lsa: `git init`, `.gitignore`, birinchi commit. Remote yo'q bo'lsa DECISIONS.md ga yoz va M0 hisobotida remote URL so'ra.

---

## 9. HANDOFF — CLAUDE ↔ CODEX UZLUKSIZLIK

Loyiha bir necha sessiya/agent bo'ylab davom etadi. **PROGRESS.md** majburiy:

```markdown
# PROGRESS
## Holat
- Joriy milestone: M<N> — <nom>
- Status: not_started | in_progress | done
- Oxirgi push: <commit hash / sana>
## Milestone'lar
- [x] M0 ... / [ ] M1 ...
## Joriy milestone qadamlari
- [x] ... / [ ] ...
## Keyingi aniq qadam
<bitta jumla — keyingi agent nimadan boshlaydi>
## Ochiq savollar / bloklar
<bo'lsa>
```

Qoidalar:
- **Har ish boshida:** `git pull` → CLAUDE.md, PROGRESS.md, DECISIONS.md o'qi → qayerda to'xtaganini aniqla → o'sha joydan davom et (qaytadan boshlama).
- **Har push'dan oldin:** PROGRESS.md yangila.
- **Sessiya/limit tugashidan oldin:** ishlaydigan nuqtada commit+push, "Keyingi aniq qadam" ni aniq yoz.
- **DECISIONS.md** — barcha arxitektura/texnik qarorlar va sabablari.

---

## 10. SIFAT MEZONLARI (har milestone)

- TypeScript strict, `any` yo'q. Endpoint validatsiya bilan. Global exception filter.
- Multi-tenant izolyatsiya har joyda. Sezgir ma'lumot xavfsiz saqlanadi.
- Frontend responsive, o'zbek tilida (i18n: uz/ru/en).
- Build + lint + test push'dan oldin o'tadi.
- Har modul uchun README bo'lim yoki Swagger annotatsiya.

---

## 11. BOSHLASH

1. `git pull` (yoki yangi repo bo'lsa init) → bu faylni, PROGRESS.md, DECISIONS.md ni o'qi.
2. Qayerdan davom etishni aniqla (yangi loyiha → M0).
3. Avtonom ishla: qur → test → commit → push → PROGRESS.md yangila → keyingi qadam.
4. Faqat joriy `/goal` milestone tugaganda to'xta va qisqa hisobot ber.

**Eslatma:** Bu faylni o'zgartirma. Faqat PROGRESS.md va DECISIONS.md ni yangilab tur.
