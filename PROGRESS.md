# PROGRESS

## Holat
- Joriy milestone: **M1 — Auth + Multi-tenant + RBAC**
- Status: **done**
- Repo: https://github.com/acousticuz/crm
- Branch: `main` (`origin/main` ni kuzatadi)

## Milestone'lar
- [x] **M0** — Poydevor (monorepo, docker-compose, NestJS skeleton, Prisma schema + first migration, React+Vite+shadcn, health-check)
- [x] **M1** — Auth + Multi-tenant + RBAC
- [ ] M2 — Kontaktlar + Lead'lar
- [ ] M3 — Kanban + Teglar (YADRO)
- [ ] M4 — Triggerlar
- [ ] M5 — SMS
- [ ] M6 — FreePBX telefoniya
- [ ] M7 — STT
- [ ] M8 — AI tahlil + QA
- [ ] M9 — Dashboard + KPI
- [ ] M10 — Omnichannel inbox + auto-javob
- [ ] M11 — Yakuniy (deploy + seed + smoke-test)

## Joriy milestone qadamlari (M1)
- [x] M1 dependencies: `@nestjs/jwt`, `@nestjs/passport`, `passport-jwt`, `argon2`, `nestjs-cls`, `jest`, `ts-jest`, `supertest`
- [x] Common layer: nestjs-cls based RequestContext (tenantId/userId/role/skipTenantFilter), decorators `@Public`, `@Roles`, `@CurrentUser`, `@Audit`, guards `JwtAuthGuard`+`RolesGuard`, global `HttpExceptionFilter`
- [x] **Prisma tenant extension** (`prisma-tenant.extension.ts`) — `$allOperations` hook auto-injects `tenantId` into where/data/create/upsert for all 16 tenant-scoped models; passes through when no context or `skipTenantFilter`
- [x] `PrismaService.t` — extended client accessor; `asSuperAdmin()` helper for legitimate cross-tenant ops
- [x] **AuthModule** — POST /auth/login, POST /auth/refresh, GET /auth/me; argon2id password hashing; access (15m) + refresh (7d) tokens with separate secrets; JwtStrategy populates CLS context on every authenticated request
- [x] **TenantsModule** — POST /tenants (SUPER_ADMIN, creates Tenant + initial TENANT_ADMIN user in one transaction), GET /tenants, GET /tenants/:id
- [x] **UsersModule** — full CRUD scoped to the caller's tenant via Prisma extension; TENANT_ADMIN cannot grant SUPER_ADMIN
- [x] **AuditModule** — AuditService.log() writes AuditLog rows; AuditInterceptor reads @Audit() metadata and records every mutating action (tested: `tenant.create`, `user.create` rows present)
- [x] Global guards/interceptor/filter wired through `APP_GUARD`/`APP_INTERCEPTOR`/`APP_FILTER` in `AppModule`
- [x] **Seed script** (`apps/backend/scripts/seed.js`) — idempotently creates `__system__` tenant + SUPER_ADMIN user from `SUPERADMIN_EMAIL`/`SUPERADMIN_PASSWORD` env
- [x] Health endpoint marked `@Public()` so it remains reachable without auth
- [x] **Tenant-isolation test** (`test/tenant-isolation.spec.ts`) — **5 specs pass**:
  - findMany on tenant A returns only A's contacts
  - findFirst by id of B's contact while in A returns null
  - updateMany on B's id while in A affects 0 rows
  - deleteMany on B's id while in A affects 0 rows
  - create in A's scope overrides any provided tenantId (defense-in-depth)
- [x] End-to-end smoke via curl: super-admin login → create tenant → tenant-admin login → create operator → list users (auto-scoped to tenant)
- [x] `pnpm build` and `pnpm test` pass
- [x] feat(milestone-1) committed and pushed
- [x] PROGRESS.md, DECISIONS.md updated

## Tekshirilgan ishonchli oqim
| Step | Result |
|---|---|
| `pnpm build` (all workspaces) | OK |
| `pnpm test` | 5/5 pass |
| `pnpm prisma:seed` | creates `__system__` tenant + SUPER_ADMIN idempotently |
| `POST /api/v1/auth/login` (super-admin) | 200, access+refresh tokens |
| `GET /api/v1/auth/me` | 200, JWT payload |
| `POST /api/v1/tenants` (super-admin) | 201, creates Tenant + admin user atomically |
| `GET /api/v1/tenants` (super-admin) | 200, lists all tenants |
| `POST /api/v1/auth/login` (tenant-admin) | 200 |
| `POST /api/v1/users` (tenant-admin) | 201, OPERATOR created in own tenant |
| `GET /api/v1/users` (tenant-admin) | 200, only own tenant's users |
| `GET /api/v1/tenants` without Authorization | 401 |
| AuditLog rows | `tenant.create`, `user.create` recorded |

## Atrof-muhit
| Xizmat | Host port |
|---|---|
| Backend | 3005 |
| Frontend (Vite) | 5173 |
| Postgres | 5435 |
| Redis | 6380 |
| MinIO API/Console | 9100 / 9101 |
| Nginx | 8082 |

## Keyingi aniq qadam
**M2 — Kontaktlar + Lead'lar boshlash:** `apps/backend/src/modules/contacts` da Contact CRUD (qidiruv + telefon bo'yicha dublikat aniqlash) va `apps/backend/src/modules/leads` da Lead webhook (sayt/FB/IG manbalari uchun), unsorted ro'yxat, accept→Card yaratish, qoidaga ko'ra avto-taqsim. Boshlanish nuqtasi: `apps/backend/src/modules/contacts/contacts.module.ts`. Tenant izolyatsiyasi Prisma extension orqali allaqachon majburlanadi — `prisma.t.contact.X` ishlatish kifoya.

## Ochiq savollar / bloklar
1. **Node.js 18.19.1** — NestJS 10 va Prisma 5 bilan ishlaydi, lekin EOL yaqin. M11 ga qadar Node 20+ ga ko'tarilish (DECISIONS.md §2).
2. **Default SUPER_ADMIN credentials** — `RootPass2026!` (seed default `ChangeMe!2026`). Prod muhitda majburiy `SUPERADMIN_PASSWORD` env (DECISIONS.md §13).
