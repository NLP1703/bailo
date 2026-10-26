# ─── Build (monorepo pnpm) ─────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS build
WORKDIR /repo
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile

COPY packages/shared packages/shared
COPY apps/web apps/web

ARG VITE_API_URL=/api/v1
ARG VITE_PUBLIC_RECEIPT_BASE=/r
# Le front appelle l'API en relatif (/api/v1) : nginx la relaie (voir docker/40-bailo-api-proxy.sh).
# Même domaine = cookie de session first-party (sécurité 1.2). Mettre à false pour appeler
# directement VITE_API_URL (cross-origin).
ARG VITE_API_SAME_ORIGIN=true
# Monitoring (optionnel) : sans DSN, le SDK Sentry n'est jamais chargé.
ARG VITE_SENTRY_DSN=
ARG VITE_SENTRY_ENVIRONMENT=production
ENV VITE_API_URL=$VITE_API_URL VITE_PUBLIC_RECEIPT_BASE=$VITE_PUBLIC_RECEIPT_BASE \
    VITE_API_SAME_ORIGIN=$VITE_API_SAME_ORIGIN \
    VITE_SENTRY_DSN=$VITE_SENTRY_DSN VITE_SENTRY_ENVIRONMENT=$VITE_SENTRY_ENVIRONMENT
RUN pnpm --filter @bailo/shared build && pnpm --filter @bailo/web build

# ─── Service statique ──────────────────────────────────────────────────────────
FROM nginx:alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
# Exécuté par l'entrypoint nginx avant le démarrage : génère le proxy /api.
COPY apps/web/docker/40-bailo-api-proxy.sh /docker-entrypoint.d/40-bailo-api-proxy.sh
RUN chmod 755 /docker-entrypoint.d/40-bailo-api-proxy.sh
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
