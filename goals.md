# GOALS.md — Claude Code uchun tayyor /goal buyruqlari

> Har milestone uchun bitta `/goal`. Tartib bilan ber: bittasi tugagach (goal o'zi tozalanadi), natijani tekshir, keyin keyingisini ber. Har birida turn cap bor — nazoratsiz xarajatdan saqlaydi.
>
> **Birinchi marta** (kod yozishdan oldin) shuni yoz:
> `Read CLAUDE.md fully. Confirm you understand the product, all modules in section 5, the milestones, and the autonomy + git push + PROGRESS.md rules. Do not code yet.`

---

## M0 — Poydevor
```
/goal MILESTONE 0 complete per CLAUDE.md: monorepo (pnpm workspaces) with apps/backend, apps/frontend, packages/shared created; docker-compose.yml runs postgres, redis, minio, nginx; NestJS backend skeleton with Prisma schema covering all entities in section 5.1 and first migration applied; React+Vite+shadcn/ui frontend skeleton with routing; health-check endpoint returns 200. `pnpm build` passes in backend and frontend with zero errors. Committed as "feat(milestone-0)" and pushed. PROGRESS.md updated to mark M0 done. Stop after 60 turns if blocked.
```

## M1 — Auth + Multi-tenant + RBAC
```
/goal MILESTONE 1 complete per CLAUDE.md section 6: JWT auth (access+refresh) with argon2 hashing; Prisma extension auto-filters every query by tenantId; RBAC guards for all 5 roles; AuditLog works; super-admin can create tenants and tenant-admin can manage users. A test proving one tenant cannot read another tenant's data passes. `pnpm build` and `pnpm test` pass. Committed as "feat(milestone-1)" and pushed. PROGRESS.md updated. Stop after 60 turns if blocked.
```

## M2 — Kontaktlar + Lead'lar
```
/goal MILESTONE 2 complete per CLAUDE.md sections 5.7: Contact CRUD with search, filter, and duplicate detection by phone; Lead intake webhook for website/Facebook/Instagram forms; unsorted leads list with accept (creates Card) and reject; automatic distribution to pipeline and operator by rule; source tracking. `pnpm build` and `pnpm test` pass. Committed as "feat(milestone-2)" and pushed. PROGRESS.md updated. Stop after 50 turns if blocked.
```

## M3 — Kanban + Teglar (YADRO)
```
/goal MILESTONE 3 complete per CLAUDE.md sections 5.2 and 5.3: Pipeline and Stage CRUD (ordered, colored, WON/LOST types); Card CRUD; AmoCRM-style Kanban board with @dnd-kit drag-and-drop that updates stageId and enteredStageAt, writes AuditLog, and broadcasts changes via Socket.io; card detail panel showing contact, tags, tasks, notes, call history placeholder, sms history placeholder, with click-to-call and send-sms buttons (stubbed); Tag CRUD plus attach/detach to cards and filter by tag; Notes and Tasks on cards; Kanban filters (tag, responsible, branch, source, date) and quick search by name/phone. `pnpm build` and `pnpm test` pass. Committed as "feat(milestone-3)" and pushed. PROGRESS.md updated. Stop after 80 turns if blocked.
```

## M4 — Triggerlar
```
/goal MILESTONE 4 complete per CLAUDE.md section 5.6: domain events emitted for stage-changed, tag-added/removed, card/lead-created, time-in-stage; trigger-engine listens, checks conditions (source, branch, responsible, tag, budget), and executes actions move-card, add/remove-tag, create-task via a retrying queue; Trigger CRUD UI for tenant-admin. SMS action is defined but wired in M5. `pnpm build` and `pnpm test` pass. Committed as "feat(milestone-4)" and pushed. PROGRESS.md updated. Stop after 60 turns if blocked.
```

## M5 — SMS
```
/goal MILESTONE 5 complete per CLAUDE.md section 5.5: SMS adapter interface with Eskiz.uz and Play Mobile implementations; SmsTemplate CRUD with variables {ism}{sana}{summa}; manual send from card and automatic send from trigger action; delivery status tracking via webhook; rate/spam protection. The SMS trigger action from M4 now works end to end. `pnpm build` and `pnpm test` pass. Committed as "feat(milestone-5)" and pushed. PROGRESS.md updated. Stop after 60 turns if blocked.
```

## M6 — FreePBX telefoniya
```
/goal MILESTONE 6 complete per CLAUDE.md section 5.4: telephony-worker connects to FreePBX via AMI, reads CDR, fetches recordings; inbound call triggers screen-pop over Socket.io with contact lookup by number; outbound click-to-call via AMI Originate; Call records saved with direction, status, duration, recordingUrl, cdrUniqueId, linked to card; MISSED calls auto-create a callback Task. If no real PBX is available, a mock AMI/CDR simulator drives the flow but the interface is ready for a real connection. `pnpm build` and `pnpm test` pass. Committed as "feat(milestone-6)" and pushed. PROGRESS.md updated. Stop after 80 turns if blocked.
```

## M7 — STT
```
/goal MILESTONE 7 complete per CLAUDE.md section 5.8 (STT part): ai-worker consumes a BullMQ queue; STT adapter interface with at least one working uz/ru implementation; call audio is transcribed with speaker separation (operator vs customer) and timestamps; Transcript saved with confidence; transcription runs async after a call ends and attaches to the card. `pnpm build` and `pnpm test` pass. Committed as "feat(milestone-7)" and pushed. PROGRESS.md updated. Stop after 60 turns if blocked.
```

## M8 — AI tahlil + QA (G'ALABA YADROSI)
```
/goal MILESTONE 8 complete per CLAUDE.md section 5.8 (analysis + QA): LLM adapter; transcript analysis produces sentiment, topic, summary, nextStep, and suggested tags; QA engine takes a Script (sections + criteria + maxScore) and a Transcript and returns per-criterion passed + score + evidence quote, plus a 0-100 total; supervisor override supported; prompts live in prompts/ and are versioned. A test that scores a known transcript against a known script and gets a stable, evidence-backed result passes. `pnpm build` and `pnpm test` pass. Committed as "feat(milestone-8)" and pushed. PROGRESS.md updated. Stop after 70 turns if blocked.
```

## M9 — Dashboard + KPI
```
/goal MILESTONE 9 complete per CLAUDE.md section 5.9: operator KPI dashboard (inbound/outbound call counts, average QA score, conversion %, average duration, sentiment %, script-adherence %); supervisor view comparing teams/branches and surfacing weakest/strongest criteria for coaching; per-call scorecard view with criteria, scores, and evidence; trend charts over time. `pnpm build` and `pnpm test` pass. Committed as "feat(milestone-9)" and pushed. PROGRESS.md updated. Stop after 60 turns if blocked.
```

## M10 — Omnichannel inbox + auto-javob
```
/goal MILESTONE 10 complete per CLAUDE.md section 5.10: inbox receives Instagram/Facebook DMs and comments via Graph API; AI generates a reply draft that an operator must review, edit, and approve before sending; medical, pricing, and legal replies are never auto-sent; all auto-replies are written to AuditLog. `pnpm build` and `pnpm test` pass. Committed as "feat(milestone-10)" and pushed. PROGRESS.md updated. Stop after 60 turns if blocked.
```

## M11 — Yakuniy (deploy + seed + smoke-test)
```
/goal MILESTONE 11 complete per CLAUDE.md: production docker-compose with Nginx + SSL config; database backup script; Swagger API docs; README with setup and run instructions; DECISIONS.md current; Acoustic seed data (one tenant with sample pipeline, stages, tags, script, and users); a full smoke-test script that runs the entire flow (call -> transcript -> analysis -> QA score -> trigger -> SMS) and passes. `pnpm build`, `pnpm test`, and the smoke-test all pass. Committed as "feat(milestone-11)" and pushed. PROGRESS.md marks the project complete. Stop after 70 turns if blocked.
```

---

## Foydali buyruqlar
- `/goal` (argumentsiz) — joriy holat: shart, turlar soni, tekshiruvchi sababi
- `/goal clear` — to'xtatish (yoki `stop`, `off`, `cancel`)
- `claude -p "/goal <shart>"` — headless rejim (CI/skript)

## Codex'ga o'tish (Claude limiti tugasa)
Codex'da `/goal` yo'q. Unga oddiy buyruq ber:
```
Read CLAUDE.md and PROGRESS.md. Continue from the "Keyingi aniq qadam" in PROGRESS.md. Work autonomously, commit and push at each milestone, update PROGRESS.md before each push. Do not ask for permission on small steps.
```
```
