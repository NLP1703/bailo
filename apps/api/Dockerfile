# ─── Étape 1 : build (monorepo pnpm) ──────────────────────────────────────────
FROM node:20-bookworm-slim AS build
WORKDIR /repo

RUN corepack enable
# Manifests d'abord (cache des dépendances)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile

# Sources
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @citegest/shared build \
 && pnpm --filter @citegest/api exec prisma generate \
 && pnpm --filter @citegest/api build

# Élague vers les dépendances de production
RUN pnpm --filter @citegest/api --prod deploy /out

# ─── Étape 2 : image d'exécution ──────────────────────────────────────────────
FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Chromium pour la génération PDF (Lot 3) — dépendances système.
RUN apt-get update && apt-get install -y --no-install-recommends \
      openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/dist ./dist
COPY --from=build /repo/apps/api/prisma ./prisma
COPY apps/api/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]
