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
ENV VITE_API_URL=$VITE_API_URL VITE_PUBLIC_RECEIPT_BASE=$VITE_PUBLIC_RECEIPT_BASE
RUN pnpm --filter @bailo/shared build && pnpm --filter @bailo/web build

# ─── Service statique ──────────────────────────────────────────────────────────
FROM nginx:alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
