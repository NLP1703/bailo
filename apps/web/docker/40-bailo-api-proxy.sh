#!/bin/sh
# Génère le proxy same-origin /api → API Bailo, exécuté par l'image nginx officielle
# avant le démarrage (répertoire /docker-entrypoint.d).
#
# Cible, par ordre de priorité :
#   1. API_UPSTREAM  — ex. https://bailo-production.up.railway.app
#   2. VITE_API_URL  — si c'est une URL absolue, son origine (schéma + hôte) est reprise.
#      Sur Railway, les variables du service sont aussi présentes à l'exécution :
#      le proxy se configure donc tout seul à partir de la variable de build existante.
# Sans cible, aucun proxy n'est généré (Docker Compose : Caddy route déjà /api).
set -eu

OUT_DIR=/etc/nginx/bailo
OUT_FILE="$OUT_DIR/api-proxy.inc"
mkdir -p "$OUT_DIR"
rm -f "$OUT_FILE"

upstream="${API_UPSTREAM:-}"
if [ -z "$upstream" ]; then
  case "${VITE_API_URL:-}" in
    http://*|https://*) upstream="${VITE_API_URL}" ;;
  esac
fi
# Ne garder que l'origine : https://hote[:port]
upstream=$(printf '%s' "$upstream" | sed -E 's#^(https?://[^/]+).*$#\1#')

if [ -z "$upstream" ]; then
  echo "bailo: aucun API_UPSTREAM / VITE_API_URL absolu — proxy /api désactivé"
  exit 0
fi

host=$(printf '%s' "$upstream" | sed -E 's#^https?://##; s#:[0-9]+$##')

# Résolution DNS paresseuse (variable + resolver) : nginx démarre même si l'API
# est momentanément introuvable, au lieu de boucler en erreur.
resolver=$(awk '/^nameserver/ { print $2; exit }' /etc/resolv.conf 2>/dev/null || true)
[ -n "$resolver" ] || resolver=8.8.8.8
case "$resolver" in
  *:*) resolver="[$resolver]" ;;
esac

cat > "$OUT_FILE" <<EOF
location /api/ {
  resolver $resolver valid=30s ipv6=on;
  set \$bailo_api $upstream;
  proxy_pass \$bailo_api;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Host \$host;
  proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto \$http_x_forwarded_proto;
  proxy_set_header X-Request-Id \$request_id;
  proxy_ssl_server_name on;
  proxy_ssl_name $host;
  proxy_connect_timeout 10s;
  proxy_read_timeout 60s;
  client_max_body_size 15m;
}
EOF

echo "bailo: proxy /api -> $upstream"
