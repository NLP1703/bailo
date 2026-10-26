# ─── Étape 1 : build (monorepo pnpm) ──────────────────────────────────────────
FROM node:20-bookworm-slim AS build
WORKDIR /repo

RUN corepack enable
# Chromium n'est jamais téléchargé par Puppeteer au build : l'image d'exécution
# utilise, si demandé, le Chromium du système (voir INSTALL_CHROMIUM plus bas).
ENV PUPPETEER_SKIP_DOWNLOAD=true
# Manifests d'abord (cache des dépendances)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile

# Sources
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @bailo/shared build \
 && pnpm --filter @bailo/api exec prisma generate \
 && pnpm --filter @bailo/api build

# Élague vers les dépendances de production
RUN pnpm --filter @bailo/api --prod deploy /out

# ─── Étape 2 : image d'exécution ──────────────────────────────────────────────
FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Chromium pour de vrais PDF (reçus, contrats) — optionnel car il alourdit l'image
# (~300 Mo). Sur Railway : ajouter la variable INSTALL_CHROMIUM=true au service API
# et passer PDF_ENGINE=puppeteer. Sinon, repli HTML (PDF_ENGINE=html).
ARG INSTALL_CHROMIUM=false
RUN apt-get update && apt-get install -y --no-install-recommends \
      openssl ca-certificates \
  && if [ "$INSTALL_CHROMIUM" = "true" ]; then \
       apt-get install -y --no-install-recommends chromium fonts-dejavu-core fonts-liberation; \
     fi \
  && rm -rf /var/lib/apt/lists/*
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/dist ./dist
COPY --from=build /repo/apps/api/prisma ./prisma
COPY apps/api/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]
