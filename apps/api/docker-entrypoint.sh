#!/bin/sh
set -e

# Applique les migrations (schéma + contraintes) avant de démarrer l'API.
echo "→ Application des migrations Prisma…"
node node_modules/prisma/build/index.js migrate deploy

exec "$@"
