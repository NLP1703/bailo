#!/usr/bin/env bash
# Génère des secrets forts pour .env (JWT access/refresh + cookie).
# Usage : ./scripts/generate-secrets.sh > .env.secrets
#   puis fusionner dans .env (ou .env.production).

set -euo pipefail

gen() {
  # 48 octets aléatoires → ~64 car base64 ; tronque et strip des '=' finaux.
  openssl rand -base64 48 | tr -d '\n' | tr -d '='
}

echo "# Secrets générés le $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "JWT_ACCESS_SECRET=\"$(gen)\""
echo "JWT_REFRESH_SECRET=\"$(gen)\""
echo "COOKIE_SECRET=\"$(gen)\""
echo "S3_ACCESS_KEY=\"$(openssl rand -hex 16)\""
echo "S3_SECRET_KEY=\"$(openssl rand -base64 32 | tr -d '\n' | tr -d '=')\""
