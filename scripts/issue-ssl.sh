#!/usr/bin/env bash
# One-time Let's Encrypt certificate issuance for the production domain.
# Run on the host before the first nginx restart that expects TLS files
# under /etc/letsencrypt/live/acoustic/.
#
# Usage:
#   ./scripts/issue-ssl.sh acoustic.example.com admin@example.com
#
# Renewal: certbot inside the container handles automatic 30-day renew;
# a separate cron line touches it daily.

set -euo pipefail

DOMAIN="${1:?Usage: ./scripts/issue-ssl.sh <domain> <email>}"
EMAIL="${2:?Usage: ./scripts/issue-ssl.sh <domain> <email>}"

mkdir -p ./certbot/www ./certbot/conf

# Use the certbot/certbot image directly; nginx must be up serving the
# /.well-known/acme-challenge/ path before this runs.
docker run --rm \
  -v "$PWD/certbot/conf:/etc/letsencrypt" \
  -v "$PWD/certbot/www:/var/www/certbot" \
  certbot/certbot:latest \
  certonly --webroot --webroot-path=/var/www/certbot \
  --email "$EMAIL" --agree-tos --no-eff-email \
  --cert-name acoustic \
  -d "$DOMAIN"

echo "Certificate issued for ${DOMAIN}. Reload nginx:"
echo "  docker compose -f docker-compose.prod.yml exec nginx nginx -s reload"
