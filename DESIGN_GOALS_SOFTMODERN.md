# DESIGN_GOALS_SOFTMODERN.md — Soft Modern dizayn (desktop + mobil)

> Acoustic Call-Center CRM uchun to'liq qayta dizayn. Uslub: **Soft Modern** — yumshoq, iliq, zamonaviy, professional. Desktop va mobilda optimal. ui/ux-pro-max skill ishlatiladi. MUHIM: faqat ko'rinish o'zgaradi — funksiya, route, API, logika hech qachon o'zgarmaydi.

---

## DIZAYN TIZIMI — TOKEN'LAR

Agent bu token'larni `tailwind.config.ts` va `src/styles/tokens.css` ga yozadi. Barcha sahifalar shu token'lardan foydalanadi.

### Rang palitrasi
```
--color-bg-base:       #F7F5F2   ← asosiy fon (iliq oq, sovuq emas)
--color-bg-surface:    #FFFFFF   ← karta, panel, modal
--color-bg-muted:      #EFEDE9   ← ikkinchi darajali fon, input
--color-border:        #E4E1DB   ← chegara (nozik, iliq)
--color-border-focus:  #0B8B6E   ← fokus holati

--color-accent:        #0B8B6E   ← asosiy aksent (Acoustic teal)
--color-accent-light:  #E6F5F1   ← aksent fon (badge, tag)
--color-accent-hover:  #097A5F   ← hover holati

--color-text-primary:  #1A1A18   ← asosiy matn
--color-text-secondary:#6B6860   ← ikkinchi darajali matn
--color-text-muted:    #9E9B96   ← placeholder, yordam matn

--color-success:       #1A8A4A   ← WON, yuborildi
--color-success-bg:    #E8F5EE
--color-warning:       #B45E00   ← muddat, ogohlantirish
--color-warning-bg:    #FEF3E7
--color-danger:        #C42B2B   ← javobsiz, xato, LOST
--color-danger-bg:     #FDEAEA
--color-info:          #1D6FB5   ← ma'lumot, tahlil
--color-info-bg:       #EBF4FD
```

### Tipografiya
```
Display/Heading:  "Plus Jakarta Sans" (og'ir, zamonaviy, CRM uchun o'qilishi oson)
Body/UI:          "Inter" (toza, qulay, keng qo'llab-quvvatlanadi)
Mono (kod/raqam): "JetBrains Mono" (extension, telefon raqamlari uchun)

Shrift o'lchamlari:
xs: 11px  sm: 12px  base: 14px  md: 16px  lg: 18px  xl: 20px  2xl: 24px  3xl: 30px
```

### Qiymatlar
```
Border-radius: sm=6px, md=10px, lg=14px, xl=20px, full=9999px
Shadow:
  card:   0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)
  raised: 0 4px 12px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)
  modal:  0 20px 60px rgba(0,0,0,0.12), 0 8px 20px rgba(0,0,0,0.06)
Spacing scale: 4px bazasida (4, 8, 12, 16, 20, 24, 32, 40, 48, 64)
Transition: 150ms ease (default), 200ms ease (modal/sheet)
```

### Imzo element (signature)
Kanban kartasidagi **qo'ng'iroq holati chip'i** — yumshoq pill shape, rang-belgi (yashil/sariq/qizil/ko'k), minimal ikonka. Bu butun dasturda takrorlanuvchi "Soft Modern" belgisi.

---

## DESIGN 0 — Dizayn tizimi va asosiy komponentlar

Kontekst:
```
We are redesigning Acoustic CRM with "Soft Modern" style: warm neutral base (#F7F5F2), clean white surfaces, soft shadows, rounded corners (10-14px), Inter + Plus Jakarta Sans fonts, #0B8B6E accent. Desktop-first but fully mobile-optimized. This is a professional call-center tool used 8+ hours daily — readable, calm, never decorative. Visual only — no functional changes. Read the current frontend structure (apps/frontend/src) including tailwind.config, existing components, and shadcn/ui setup. Use the ui/ux skill. Confirm understanding, do not code yet.
```

Goal:
```
/goal Establish the Soft Modern design system for Acoustic CRM, visual only, no functional changes. (1) Design tokens: add the full token set to tailwind.config.ts and src/styles/tokens.css — warm neutral palette (#F7F5F2 base, #FFFFFF surface, #0B8B6E accent), Inter + Plus Jakarta Sans fonts (load from Google Fonts or self-host), JetBrains Mono for numbers/extensions, spacing scale (4px base), border-radius (sm=6 md=10 lg=14 xl=20), soft shadow scale (card/raised/modal), semantic colors (success/warning/danger/info each with bg variant), transition defaults. (2) Restyle all shadcn/ui base components to the token system: Button (primary/secondary/ghost/danger variants, soft rounded, clear hover/active/disabled states), Input + Select + Textarea (warm border, focus ring in accent, clear error state), Card (white surface, card shadow, lg radius), Badge/Tag (pill shape, color variants using semantic bg+text pairs), Dialog/Sheet (modal shadow, backdrop blur subtle), Table (clean rows, hover highlight, sticky header), Tabs (underline style, not boxed), Toast/notification (left-accent-border style, icons). (3) Typography: set base 14px, clear scale, Plus Jakarta Sans for headings, Inter for body, sentence case everywhere, active-voice labels. (4) Write STYLE_GUIDE.md covering tokens, component variants, do/don't rules, and mobile breakpoints (sm=640 md=768 lg=1024 xl=1280). No business logic touched. `pnpm build`, `pnpm test`, `pnpm lint` pass. Commit "feat(design-0): soft modern design system and base components" and push. PROGRESS.md updated. Stop after 60 turns.
```

---

## DESIGN 1 — Layout, sidebar, top bar (desktop + mobil)

Kontekst:
```
Continue Soft Modern redesign using STYLE_GUIDE.md. Now redesign the app shell — layout, sidebar navigation, and top bar. This must work on both desktop (sidebar always visible) and mobile (sidebar as a drawer). Visual only. Confirm, do not code yet.
```

Goal:
```
/goal Redesign the app shell to Soft Modern, visual only, desktop + mobile. (1) Desktop layout: a fixed left sidebar (240px wide, #F7F5F2 bg, right border), clean icon+label nav items with accent highlight for active, collapsible to icon-only mode (64px) with tooltip labels, smooth 200ms transition; main content area with consistent 24px padding. (2) Top bar: minimal (48px height), shows current section title, tenant/user avatar with dropdown (profile, settings, logout), a "Sotuv skripti" quick-access button (accent outlined), global search (Ctrl+K shortcut hint), and notification bell. (3) Mobile (below 768px): sidebar becomes a bottom tab bar (5 main items, icon+label, accent for active) for thumb-friendly navigation; top bar simplifies to logo + avatar + hamburger for secondary items; all touch targets minimum 44px. (4) Breadcrumb on inner pages. (5) Smooth page transitions (150ms fade). Keep all routes, navigation logic, and auth unchanged. `pnpm build`, `pnpm test`, `pnpm lint` pass. Commit "feat(design-1): soft modern app shell desktop and mobile" and push. PROGRESS.md updated. Stop after 50 turns.
```

---

## DESIGN 2 — Kanban (eng muhim ekran)

Kontekst:
```
Continue Soft Modern redesign. Now the Kanban board — the most-used screen, must work perfectly on desktop and tablet. Visual only. Confirm, do not code yet.
```

Goal:
```
/goal Redesign the Kanban board to Soft Modern, visual only, desktop + tablet optimized. (1) Board layout: horizontal scroll with snap, columns min-width 280px max-width 320px, comfortable gap (16px), columns fill viewport height. (2) Column header: stage name (Plus Jakarta Sans medium), card count badge (muted), colored top-border strip (stage color), collapse toggle, add-card shortcut; WON columns get a subtle success tint, LOST a subtle danger tint. (3) Card — the signature element: white surface, card shadow, 14px radius, 16px padding; clear hierarchy: top row = customer name (medium 14px) + missed-call badge (danger pill) OR last-call time (muted 12px); phone in JetBrains Mono (12px, muted); colored tag chips (pill, 11px, soft bg+text); bottom row = responsible avatar (24px circle) + branch label + due date (warning if overdue); sip-call icon button (ghost, 32px, appears on hover desktop / always on mobile); subtle divider between sections; hover: raised shadow + slight lift (translateY -1px). (4) Filter bar: compact chip-style filters (voronka select, mas'ul select, multi-select branch with chips, date range, tag multi-select), collapsible on mobile into a filter drawer triggered by a filter icon button. (5) Empty column: a quiet illustration or icon + "Hali karta yo'q" label. Keep all dnd-kit logic, Socket.io, and filtering logic. `pnpm build`, `pnpm test`, `pnpm lint` pass. Commit "feat(design-2): soft modern kanban board" and push. PROGRESS.md updated. Stop after 50 turns.
```

---

## DESIGN 3 — Karta paneli, qo'ng'iroqlar, tahlil/QA

Kontekst:
```
Continue Soft Modern redesign. Now the card detail sheet/panel, calls view, and QA scorecard. Visual only. Confirm, do not code yet.
```

Goal:
```
/goal Redesign the card detail panel, calls view, and QA scorecard to Soft Modern, visual only, mobile-friendly. (1) Card detail sheet (right drawer on desktop, full-screen on mobile): warm white surface, modal shadow; header = customer name (Plus Jakarta Sans 20px) + phone (JetBrains Mono) + stage badge + sip-call button (accent) + SMS button; tabs = Umumiy / Qo'ng'iroqlar / SMS / Izohlar / Vazifalar; smooth tab transitions. (2) Calls tab: each call is a clean row — inbound/outbound icon (teal/purple), date+time, duration (JetBrains Mono), status badge (Javob berildi/Javobsiz/Band) in semantic colors; "Tahlil qil" button (accent outlined, shown only if not analyzed); analysis state chips (Tahlil yo'q / Tahlillanmoqda... / Baholandi ✓ with score). (3) QA scorecard (expandable panel within call row): overall score as a clean arc/ring progress (accent color), per-criterion rows (criterion name, passed/failed icon, score, evidence quote in italic muted text), "Xatoliklar" section with a distinct danger-tinted left-border card listing each mistake; supervisor-override inline edit. (4) SMS + Note + Task tabs: clean timeline view, send-SMS sheet with template picker (template list from Eskiz, variable fill inputs, character count). (5) All touch targets 44px+, sheet closes by swipe-down on mobile. Keep all logic. `pnpm build`, `pnpm test`, `pnpm lint` pass. Commit "feat(design-3): card panel, calls, qa scorecard soft modern" and push. PROGRESS.md updated. Stop after 60 turns.
```

---

## DESIGN 4 — Sotuv skripti, inbox, bildirishnomalar

Kontekst:
```
Continue Soft Modern redesign. Now the sales script view, omnichannel inbox, and notification/toast system. Visual only. Confirm, do not code yet.
```

Goal:
```
/goal Redesign the sales script, inbox, and notifications to Soft Modern, visual only. (1) Sotuv skripti panel (accessible from top bar button, opens as a right-side drawer): a beautiful step-by-step guide — each section is a numbered card (Plus Jakarta Sans heading, body text, key phrases highlighted in accent-light bg), progress indicator as operator moves through steps, minimal and calm so it doesn't distract; edit mode for SUPERVISOR/ADMIN (inline editing, save/cancel, version note); accessible on mobile as a bottom sheet. (2) Omnichannel inbox: unified list of Telegram messages and DMs (channel icon badge, sender, preview, timestamp, unread dot in accent); message thread view (chat-bubble style: operator right/accent bg, customer left/muted bg); reply input with send button; human-in-the-loop warning banner for medical/pricing messages. (3) Toast/notification system: left-accent-border style cards (success=green, warning=amber, danger=red, info=blue), appear top-right desktop / top-center mobile, 4s auto-dismiss, stack up to 3, swipe-dismiss on mobile. Keep all logic. `pnpm build`, `pnpm test`, `pnpm lint` pass. Commit "feat(design-4): sales script, inbox, notifications soft modern" and push. PROGRESS.md updated. Stop after 50 turns.
```

---

## DESIGN 5 — Settings va Dashboard/Hisobotlar

Kontekst:
```
Continue Soft Modern redesign. Now Settings and all dashboard/report pages. Visual only. Confirm, do not code yet.
```

Goal:
```
/goal Redesign Settings and dashboards to Soft Modern, visual only, desktop + mobile. (1) Settings: two-column layout desktop (left nav list, right content panel) / single column mobile; each integration card shows name, channel icon, status badge (Ulangan ✓ in success-bg / Ulanmagan in muted / Xato in danger-bg), "Sozlash" button; forms are clean with warm inputs, masked secret fields (show last 4 chars), clear Test/Save/Disconnect actions, inline success/error feedback without page reload. (2) KPI dashboard: metric cards (white surface, card shadow, metric value in Plus Jakarta Sans 30px bold, label in 12px muted, trend arrow); clean charts using existing charting lib with accent color palette; operator comparison table with sortable columns and name+extension; branch monthly report as a clean bar chart + summary table. (3) Coaching report: per-operator accordion — QA score trend line, weakest criteria highlighted in warning-bg, mistake frequency list; designed to be printed or exported cleanly. (4) All pages responsive: cards stack on mobile, charts full-width, tables horizontally scrollable. Keep all data and logic. `pnpm build`, `pnpm test`, `pnpm lint` pass. Commit "feat(design-5): settings and dashboards soft modern" and push. PROGRESS.md updated. Stop after 60 turns.
```

---

## QOIDALAR (har bosqich uchun)
- **Faqat ko'rinish** — funksiya, route, API, hook, logika hech qachon o'zgarmaydi.
- **ui/ux skill va STYLE_GUIDE.md** har bosqichda ishlatiladi.
- **Mobil har bosqichda** — faqat oxirida emas, har komponent mobilda ham tekshiriladi.
- **Touch target minimum 44px** — barcha tugmalar, linklar, interaktiv elementlar.
- **build + test + lint** har push'dan oldin o'tadi.

## TARTIB
D0 (tizim) → D1 (layout) → D2 (Kanban) → D3 (karta/QA) → D4 (skript/inbox) → D5 (settings/hisobot)

## MUHIM — D0 dan keyin tekshiruv
D0 tugagach brauzerda asosiy komponentlarni ko'ring (login sahifasi, tugmalar, formalar). Agar umumiy yo'nalish (iliqlik, shrift, ranglar) yoqsa — davom eting. Yoqmasa — faqat D0 ni qayta sozlang, qolgan 5 bosqich avtomatik moslashadi.
