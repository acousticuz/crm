# PROGRESS

## Holat
- Joriy milestone: **M3 — Kanban + Teglar (YADRO)**
- Status: **done**
- Repo: https://github.com/acousticuz/crm

## Milestone'lar
- [x] **M0** — Poydevor
- [x] **M1** — Auth + Multi-tenant + RBAC
- [x] **M2** — Kontaktlar + Lead'lar
- [x] **M3** — Kanban + Teglar (YADRO)
- [ ] M4 — Triggerlar
- [ ] M5 — SMS
- [ ] M6 — FreePBX telefoniya
- [ ] M7 — STT
- [ ] M8 — AI tahlil + QA
- [ ] M9 — Dashboard + KPI
- [ ] M10 — Omnichannel inbox + auto-javob
- [ ] M11 — Yakuniy

## Joriy milestone qadamlari (M3)
### Backend (NestJS)
- [x] **PipelinesModule** — Pipeline CRUD (order, isDefault), Stage CRUD (order, color, type NORMAL/WON/LOST), `POST /pipelines/:id/stages/reorder` bulk reorder. Pipeline/stage o'chirishda live cards bo'lsa 400.
- [x] **TagsModule** — Tag CRUD + `POST/DELETE /cards/:id/tags/:tagId` attach/detach (idempotent upsert). Tag o'chirilganda CardTag join rows tozalanadi.
- [x] **CardsModule** — Card CRUD; `PATCH /cards/:id/move` (stageId+enteredStageAt yangilanadi, WON/LOST stage'ga ko'chsa status flip qiladi); `GET /cards` (filter tagId/responsibleUserId/branchId/source/dateFrom/dateTo, q=search by title+contact.fullName+phone); `GET /cards/:id` to'liq detail (contact, cardTags+tag, responsible, branch, pipeline, stage, tasks+assignee, notes+author, oxirgi 5 calls + 5 sms).
- [x] **NotesModule** — Note CRUD (cardId yoki contactId), faqat author yoki TENANT_ADMIN/SUPERVISOR tahrir/o'chirish.
- [x] **TasksModule** — Task CRUD, `POST /tasks/:id/complete` natijani yozadi. `GET /tasks?mine=1&completed=0` foydalanuvchining ochiq vazifalari.
- [x] **RealtimeModule (Socket.io)** — `@nestjs/websockets` + `platform-socket.io`. AppGateway JWT'ni handshake'dan oladi (auth.token yoki Authorization Bearer), `tenant:{tenantId}` xonasiga qo'shadi. RealtimeService barcha modullardan `toTenant()` ga chaqirish uchun ochiq.
- [x] **Socket eventlar:** `card:moved`, `card:created`, `card:updated` har bir card amalida tenant xonasiga emit qilinadi.
- [x] **AuditLog** — card.create/update/delete/move, tag.create/update/delete, card.tag.attach/detach, note.create/update/delete, task.create/update/complete/delete, pipeline va stage CRUD — barcha mutating endpointlar `@Audit()` bilan belgilangan va AuditInterceptor orqali yoziladi.

### Frontend (React+Vite+shadcn)
- [x] **HTTP client** (`lib/api.ts`) — axios + Authorization header interceptor + 401 → `/login` redirect.
- [x] **Auth context** (`lib/auth.tsx`) — `useAuth()` hook, login/logout, JWT localStorage'da, JWT'dan user payload parsing.
- [x] **react-query** root QueryClient bilan setup. `lib/socket.ts` — auto-token socket.io-client.
- [x] **Real LoginPage** — `POST /auth/login` → tokenlar saqlanadi → `/auth/me` o'qiladi → `/kanban` ga redirect.
- [x] **RequireAuth route guard** — login'siz Kanban/Dashboard sahifalariga kira olmaydi.
- [x] **AppLayout** — foydalanuvchi email+role ko'rsatadi, "Chiqish" tugmasi.
- [x] **shadcn primitives** qo'shildi: `Input`, `Label`, `Badge`, `Sheet` (Radix Dialog), `Textarea`.
- [x] **Kanban hooks** (`hooks/useKanban.ts`) — usePipelines, useCards (filtrlar), useTags, useUsers, useCardDetail, useMoveCard, useAttach/DetachTag, useCreateNote, useCreateTask, useKanbanRealtime (socket subscribe → invalidate).
- [x] **KanbanBoard (KanbanPage)** — pipeline tanlanadi, stages ustun bo'lib chiziladi (rangli border), kartalar grouped by stageId. `@dnd-kit/core` `DndContext` + `useDraggable`/`useDroppable` bilan ustundan ustunga ko'chirish ishlaydi (4px activation distance → click vs drag farqlanadi).
- [x] **Filterlar paneli** — pipeline tanlash, qidiruv (ism/telefon), mas'ul, filial, manba, sana oralig'i, teg bo'yicha (chip toggling).
- [x] **KanbanCard** — ism, telefon, teglar, mas'ul, due-date (kechikkan bo'lsa qizil).
- [x] **CardDetailSheet (Radix Sheet)** — kontakt info, tahrirlanadigan teglar (chip toggle), vazifalar ro'yxati + qo'shish formasi, izohlar ro'yxati + qo'shish, qo'ng'iroqlar tarixi placeholder ("M6 da ulanadi"), SMS tarixi placeholder ("M5 da ulanadi"), **click-to-call va SMS yuborish stub tugmalar** (disabled+tooltip).
- [x] **Real-time** — socket.io subscribe `card:moved/created/updated` → react-query cache invalidatsiyasi → board avtomatik yangilanadi.

### Verification
- [x] `pnpm build` (shared + backend + frontend) — xatosiz
- [x] `pnpm test` — **23/23 yashil** (5 M1 + 8 M2 + 10 M3 yangi)
- [x] **End-to-end smoke** (curl): super-admin tenant yaratdi → default pipeline+5stage seed bo'ldi → tenant-admin login → contact yaratdi → card yaratdi → next stage'ga ko'chirdi → tag yaratdi+biriktirdi → tag bo'yicha filter ishladi → detail panel to'liq qaytarildi → note va task yaratildi → name+phone bo'yicha search topdi → audit_logs jadvalida 8 ta yangi action yozildi (`card.move`, `card.tag.attach`, `note.create`, `task.create`, ...)
- [x] Vite dev server **5173** portda ishlaydi, `index.html` 200 OK qaytaradi
- [x] `feat(milestone-3)` commit + push origin/main

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
**M4 — Triggerlar:** `apps/backend/src/modules/triggers` to'ldiriladi. Domain event'lar (`@nestjs/event-emitter` orqali) — `stage-changed`, `tag-added/removed`, `card-created`, `lead-created`, `time-in-stage` (cron). TriggerEngine event'larni tinglaydi, conditions tekshiradi (source/branch/responsible/tag/budget), actions bajaradi (move-card, add/remove-tag, create-task; SMS keyingi milestone'da). Trigger CRUD UI tenant-admin uchun. Boshlanish nuqtasi: `apps/backend/src/modules/triggers/triggers.module.ts`.

## Ochiq savollar / bloklar
1. **Node.js 18.19.1** — EOL yaqin (DECISIONS.md §2).
2. **Frontend bundle 462 kB** (149 kB gzip) — code-splitting M9/M11 da.
