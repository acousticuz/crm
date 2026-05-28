#!/usr/bin/env bash
# Postgres backup script for Acoustic CRM. Designed to run inside the
# `postgres` container (cron) OR from the host via `docker compose exec`.
#
# Output: ./backups/acoustic-<UTC-timestamp>.sql.gz on the host (mounted
# into the container at /backups via docker-compose.prod.yml).
#
# Retention: keeps the last 14 daily files; older ones are removed.
#
# Cron line (host):
#   30 2 * * * cd /opt/acoustic-crm && \
#     docker compose -f docker-compose.prod.yml exec -T postgres /backups/backup-db.sh

set -euo pipefail

PG_USER="${POSTGRES_USER:-acoustic}"
PG_DB="${POSTGRES_DB:-acoustic_crm}"
TS=$(date -u +%Y-%m-%dT%H%M%SZ)
OUT_DIR="${BACKUP_DIR:-/backups}"
OUT_FILE="${OUT_DIR}/acoustic-${TS}.sql.gz"

mkdir -p "$OUT_DIR"

echo "Backing up ${PG_DB} as ${PG_USER} to ${OUT_FILE} ..."
pg_dump -U "$PG_USER" -d "$PG_DB" --no-owner --no-privileges \
  | gzip -9 > "$OUT_FILE"

# Retention — keep the most recent 14.
ls -1t "$OUT_DIR"/acoustic-*.sql.gz 2>/dev/null \
  | tail -n +15 \
  | xargs --no-run-if-empty rm -f

echo "Backup done. Files in ${OUT_DIR}:"
ls -lh "$OUT_DIR"/acoustic-*.sql.gz 2>/dev/null || echo "(none)"
