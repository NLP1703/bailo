#!/usr/bin/env bash
# Backup PostgreSQL quotidien (audit 5.4). À lancer via cron du VPS :
#   0 3 * * * /opt/bailo/scripts/backup-postgres.sh >> /var/log/bailo-backup.log 2>&1
#
# Variables requises :
#   PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE  (ou DATABASE_URL)
#   BACKUP_DIR      — répertoire local de rétention (défaut: /var/backups/bailo)
#   RETENTION_DAYS  — nb de jours à conserver (défaut: 30)
#   S3_BUCKET?      — si défini, pousse aussi vers un bucket s3-compatible (mc)

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/bailo}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
STAMP="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
FILE="${BACKUP_DIR}/bailo-${STAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "[$(date -Iseconds)] dump → $FILE"
pg_dump --no-owner --no-privileges --format=plain | gzip -9 > "$FILE"

# Vérification minimale : fichier non vide + gzip valide.
test -s "$FILE"
gzip -t "$FILE"

# Rétention locale.
find "$BACKUP_DIR" -maxdepth 1 -name 'bailo-*.sql.gz' -mtime +"$RETENTION_DAYS" -delete

# Push S3 facultatif (bucket externe recommandé en prod).
if [[ -n "${S3_BUCKET:-}" ]]; then
  echo "[$(date -Iseconds)] push → s3://${S3_BUCKET}/backups/"
  mc cp "$FILE" "s3/${S3_BUCKET}/backups/"
fi

echo "[$(date -Iseconds)] ok ($(du -h "$FILE" | cut -f1))"
