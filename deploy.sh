#!/usr/bin/env bash
# Idempotent deploy for Acoustic CRM.
# Re-runnable: each step is "do if not already done".
# Run as root on the target server, in /srv/acoustic-crm.
set -euo pipefail

ROOT="/srv/acoustic-crm"
cd "$ROOT"

log() { printf "\n\033[1;34m▶ %s\033[0m\n" "$*"; }
warn() { printf "\033[1;33m⚠ %s\033[0m\n" "$*"; }

# 1. Ensure pnpm exists (corepack ships with Node 20+).
if ! command -v pnpm >/dev/null 2>&1; then
  log "Installing pnpm via corepack"
  corepack enable
  corepack prepare pnpm@9 --activate
  hash -r
fi
log "pnpm: $(pnpm --version)"

# 2. Ensure pm2 exists (global).
if ! command -v pm2 >/dev/null 2>&1; then
  log "Installing pm2"
  npm install -g pm2
  hash -r
fi
log "pm2: $(pm2 --version)"

# 3. Ensure data + log dirs exist.
mkdir -p "$ROOT/data/recordings" "$ROOT/data/voice-ai-recordings" "$ROOT/backups"

# 4. Bring up the infra stack (postgres / redis / minio / nginx).
log "Starting infra (docker compose)"
docker compose up -d postgres redis minio nginx
sleep 4
docker compose ps

# 5. Wait for postgres healthy.
log "Waiting for postgres health"
for i in $(seq 1 30); do
  if docker compose exec -T postgres pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; then
    echo "postgres ready"
    break
  fi
  sleep 1
done

# 6. Install JS deps (workspace-aware).
log "pnpm install (workspace)"
find . -path ./node_modules -prune -o -name node_modules -type d -prune -exec rm -rf {} +; rm -rf node_modules; CI=true NODE_ENV= pnpm install --frozen-lockfile --config.confirm-modules-purge=false

# 7a. Prisma client generate — must happen before backend tsc.
log "Prisma generate (early)"
pnpm --filter @acoustic-crm/backend exec prisma generate

# 7. Build shared + backend + workers + frontend.
log "pnpm build (shared + backend + workers)"
pnpm --filter @acoustic-crm/shared build
pnpm --filter @acoustic-crm/backend build
pnpm --filter @acoustic-crm/telephony-worker build
pnpm --filter @acoustic-crm/ai-worker build
pnpm --filter @acoustic-crm/voice-ai-worker build
# Frontend stays in dev mode (vite) — same model as the working dev box.

# 8. Prisma client + migrations.
log "Prisma generate + migrate deploy"
pnpm --filter @acoustic-crm/backend exec prisma generate
pnpm --filter @acoustic-crm/backend exec prisma migrate deploy

# 9. Seed super-admin + Acoustic demo tenant (idempotent — won't reset
#    passwords if users already exist from a prior run; first run will
#    create them with the ACOUSTIC_TENANT_ADMIN_PASSWORD from .env).
log "Seed: super-admin"
pnpm --filter @acoustic-crm/backend exec node scripts/seed.js || warn "seed.js exited non-zero (may be already-seeded)"
log "Seed: Acoustic demo tenant"
pnpm --filter @acoustic-crm/backend exec node scripts/seed-acoustic.js || warn "seed-acoustic.js exited non-zero"

# 10. Start (or reload) all PM2 services from the project ecosystem.
log "PM2 start / reload"
pm2 startOrReload ecosystem.config.cjs
pm2 save

# 11. Wait until vite dev port (5173) responds.
log "Waiting for frontend (vite) to come up"
for i in $(seq 1 30); do
  if curl -fs http://127.0.0.1:5173/ -o /dev/null 2>&1; then echo "vite ready"; break; fi
  sleep 1
done

# 12. Sanity: edge proxy.
log "Edge ($PUBLIC_ORIGIN)"
curl -fsI "$PUBLIC_ORIGIN/" 2>&1 | head -3 || warn "edge not responding"
curl -s -o /dev/null -w "GET /api → %{http_code}\n" "$PUBLIC_ORIGIN/api"
curl -s -o /dev/null -w "GET /     → %{http_code}\n" "$PUBLIC_ORIGIN/"

log "Deploy complete"
pm2 list
echo ""
echo "Frontend     : $PUBLIC_ORIGIN/"
echo "MinIO console: http://159.195.193.253:$MINIO_CONSOLE_HOST_PORT/  (user: $MINIO_ROOT_USER)"
echo "Postgres     : localhost:$POSTGRES_HOST_PORT  (use .env DATABASE_URL)"
