# PROGRESS

## Holat
- Joriy milestone: **M9 — Dashboard + KPI**
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
- [x] **M8** — AI tahlil + QA (g'alaba yadrosi)
- [x] **M9** — Dashboard + KPI
- [ ] M10 — Omnichannel inbox + auto-javob
- [ ] M11 — Yakuniy

## M9 qadamlari — Dashboard + KPI
### Backend (AnalyticsModule)
- [x] **operatorKpi(query)** — Kirish/chiqish/missed soni, o'rtacha davomiylik, **avgQaScore** (normalize 0..100), **scriptAdherencePct** (criteriaResults.passed nisbati), **conversionPct** (WON / (WON+LOST) cards), **sentiment split** (positive/neutral/negative/mixed).
- [x] **teamSummary(query)** — har OPERATOR/SUPERVISOR uchun KPI ro'yxati (jamoa taqqoslash). Branch filter qo'llab-quvvatlanadi.
- [x] **branchSummary(query)** — har Branch bo'yicha KPI yig'indisi.
- [x] **weakestCriteria(query)** — barcha QAScore.criteriaResults JSON arraylarini app qatlamida unnesting; har criterionId uchun passRate hisoblanadi; eng zaif 5 + eng kuchli 5 qaytariladi (coaching uchun).
- [x] **trends(query)** — kun yoki hafta bo'yicha bucketlash; har bucketda calls inbound/outbound/missed, avgDurationSec, avgQaScore va sentiment ulushlari.
- [x] **Endpoints (`/analytics/*`)**:
  - GET `/operator-kpi` — operator uchun o'z KPI; SUPERVISOR+ boshqasiga qarashi mumkin
  - GET `/team` — TENANT_ADMIN/SUPERVISOR/ANALYST
  - GET `/branches` — xuddi shu rollar
  - GET `/weakest-criteria` — supervayzer murabbiyligi uchun
  - GET `/trends` — har rol uchun (operator faqat o'ziga)

### Frontend
- [x] **recharts** kutubxonasi qo'shildi (bar/line/pie/responsive container).
- [x] **DashboardPage** — sana oralig'i tanlash; **KPI tile'lar** (kirish/chiqish, QA ball, konversiya); **trends line chart** (kirish/chiqish/QA ball ikki Y o'qida); **sentiment pie chart**; supervayzer uchun **weakest/strongest mezonlar**, **team bar chart taqqoslash** va **branch jadvali**.
- [x] **ScorecardPage** — `/scorecard/:callId` — AI tahlili (sentiment/topic/summary/nextStep), QA rubrikalari mezonma-mezon (passed ✓ / failed ✕) dalil iqtibos bilan, supervisor override ko'rsatiladi, transkript matn paneli.
- [x] **Router** yangilandi — `/scorecard/:callId` route AppLayout ichida.

### Tests (49/49 yashil, 5 yangi M9)
- [x] **operatorKpi** — seeded fixture'da: 3 inbound + 1 missed + 2 outbound, conversion 67% (2 WON / 1 LOST), QA 66.7%, sentiment {positive:3, negative:1, neutral:1}
- [x] **bo'sh operator** — 0 ko'rsatkichlar
- [x] **weakestCriteria** — `c3` har doim fail bo'lgan (passRate=0) ranjada birinchi; `c1`/`c2` 100% bilan strongest
- [x] **teamSummary** — har operator uchun alohida KPI
- [x] **trends** — kun bo'yicha bucket, jami 6 ta call yig'iladi (3+1+2)

### Verification
- [x] `pnpm build` — 5 paket xatosiz (frontend bundle 891 kB, recharts yuklaydi — code-split keyingi optimizatsiya)
- [x] `pnpm test` — 49/49 yashil
- [x] feat(milestone-9) commit + push origin/main

## Atrof-muhit
| Xizmat | Host port |
|---|---|
| Backend | 3005 |
| Frontend | 5173 |
| Telephony-worker | 3008 |
| ai-worker | 3 BullMQ queue consumer |
| Postgres | 5435 / Redis 6380 / MinIO 9100-9101 / Nginx 8082 |

## Keyingi aniq qadam
**M10 — Omnichannel inbox + auto-javob:** `apps/backend/src/modules/inbox` ni to'ldiring — Instagram/Facebook Graph API webhook orqali DM/comment qabul qiling (yangi Inbox/Message modellari kerak bo'lsa schema kengaytiriladi); AI javob qoralamasi (Mock LLM bilan) generatsiya qiladi; operator ko'radi, tahrirlaydi, tasdiqlaydi; tibbiy/narx/yuridik javoblar HECH QACHON avtomatik yuborilmaydi (boshqa "category guardrails" filter); barcha auto-replies AuditLog ga. Frontend `/inbox` sahifa qo'shing. Boshlanish: `apps/backend/src/modules/inbox/inbox.module.ts`.

## Ochiq savollar / bloklar
1. **Node.js 18.19.1** — EOL yaqin (DECISIONS.md §2).
2. **Frontend bundle 891 kB** — recharts katta kutubxona. M11 da `manualChunks` bilan code-split.
