# Acoustic CRM — Deploy guide

Production server: **159.195.193.253** (Debian 13)
Target dir: **/srv/acoustic-crm**
Public URL: **http://159.195.193.253:8084**

## Topology on the server

| Service | Binding | Note |
|---|---|---|
| nginx (docker) | host `:8084` | Edge proxy. Routes `/api/*` and `/socket.io/*` to backend, everything else to vite. |
| postgres (docker) | host `:25435` | DB. Persistent volume. |
| redis (docker) | host `:16380` | BullMQ + sockets. |
| minio (docker) | host `:19100` (api) / `:19101` (console) | Object storage for call recordings. |
| backend (pm2) | host `:3005` | NestJS. Listens behind nginx. |
| frontend (pm2 → vite) | host `:5173` | Dev server in production — matches the working dev-box topology. |
| telephony-worker (pm2) | n/a (TCP out to FreePBX) | AMI client. |
| ai-worker (pm2) | n/a | BullMQ consumer (STT + LLM + QA). |
| voice-ai-worker (pm2) | host `:4573` | FastAGI TCP for FreePBX inbound. Needs `ANTHROPIC_API_KEY` + `AZURE_SPEECH_KEY` in `.env`. |

## What ships in this bundle

```
/srv/acoustic-crm/
  apps/                # backend + frontend + workers (source)
  packages/shared/     # shared types
  prisma/              # schema + migrations
  docker/              # nginx + Dockerfiles
  prompts/             # versioned LLM prompts
  ecosystem.config.cjs # pm2 process map
  docker-compose.yml   # postgres + redis + minio + nginx
  .env                 # secrets (see SECRETS.md)
  deploy.sh            # idempotent runner — re-run anytime
```

## First-time deploy

```bash
ssh root@159.195.193.253
cd /srv/acoustic-crm
chmod +x deploy.sh
# Run with the .env loaded into the current shell so the steps that
# need POSTGRES_*, PUBLIC_ORIGIN, etc. see them.
set -a; . ./.env; set +a
./deploy.sh
```

The script is idempotent — safe to re-run after edits.

## After deploy

- Frontend: `http://159.195.193.253:8084/`
- Login as the super-admin: see `SECRETS.md` for credentials
- First action: open Settings → Xodimlar and change the admin password from the seed default

## Updating later

```bash
ssh root@159.195.193.253
cd /srv/acoustic-crm

# 1) Pull the latest code (or rsync from your dev box)
git pull   # or rsync from local /var/www/acoustic-crm/

# 2) Re-run deploy.sh — it'll only do what changed
set -a; . ./.env; set +a
./deploy.sh
```

## Connecting to FreePBX

The Acoustic Settings UI carries a "FreePBX telefoniya" card. Tenant admin
fills in:
- AMI host (FreePBX IP, e.g. inside Kerio Control LAN: 10.x.x.x)
- AMI port (5038)
- AMI username + secret (from `manager_custom.conf` on the PBX)
- CDR mode (`db` or `api`)
- Recordings source

The telephony-worker re-reads this config every 30 s and reconnects.

For the network:
- Kerio Control either VPNs into the CRM server, or port-forwards 5038 to the CRM IP (only).
- CRM exposes 4573 (FastAGI) inbound from FreePBX for voice-ai.

## Troubleshooting

- `pm2 logs --lines 50` — full process log
- `docker compose logs nginx` — proxy issues
- `docker compose logs postgres` — DB issues
- `pm2 restart all` — quick reset (no data loss; DB is in docker volume)

## Backup

Postgres data lives in the docker volume `acoustic-crm_postgres_data`.
Quick dump:

```bash
docker compose exec -T postgres pg_dump -U acoustic acoustic_crm \
  | gzip > /srv/acoustic-crm/backups/db-$(date +%Y%m%d-%H%M).sql.gz
```
