#!/bin/sh
set -e

# Régénère le Prisma Client — nécessaire parce que pnpm --prod deploy casse
# les symlinks du virtual store (.pnpm/.prisma/client) à la copie vers /out.
echo "→ Régénération du Prisma Client…"
node node_modules/prisma/build/index.js generate

# Applique les migrations (schéma + contraintes) avant de démarrer l'API.
echo "→ Application des migrations Prisma…"
node node_modules/prisma/build/index.js migrate deploy

exec "$@"
