# Bailo — Journal des améliorations

Suivi des améliorations appliquées depuis l'audit du 09/10/2026.

## Appliquées — Phase 1 (critique)

### Sécurité
- **1.1 Secrets** — `env.ts` rejette désormais les secrets JWT < 32 car en production
  et les patterns `change-me`, `dev-*`, `secret*`, `password*`, ainsi que les clés
  MinIO par défaut (`minioadmin`) et un `CORS_ORIGIN` non-HTTPS. Scripts
  `scripts/generate-secrets.{sh,ps1}` pour produire des secrets forts. Variables
  `COOKIE_SECRET`, `COOKIE_SECURE`, `COOKIE_SAMESITE` ajoutées (préparation 1.2).
- **1.3 Rate-limiting Redis** — Nouveau module global `common/redis/` :
  `RedisService` (client ioredis partagé) + `RateLimiterService` (INCR+EXPIRE,
  repli in-memory si Redis indisponible). `auth.service.ts` ne porte plus de
  `Map` interne, le compteur survit maintenant au redémarrage de l'API.

### Backend
- **3.2 Codes d'erreur typés** — Nouveau `packages/shared/src/error-codes.ts`
  (table de codes machine + messages FR) et `common/http/app.exception.ts`
  (classe `AppException` avec helpers `.conflict()`, `.paymentRequired()`,
  `.tooMany()`…). `auth.service.ts` et `billing.service.ts` renvoient maintenant
  des codes stables (`AUTH_PHONE_ALREADY_USED`, `UNIT_QUOTA_EXCEEDED`…) que le
  front peut mapper en i18n.
- **3.3 Endpoint /health + /ready** — Nouveau `modules/health/` monté hors du
  préfixe `/api/v1`. `/health` = liveness (uptime). `/ready` = readiness avec
  ping Postgres + Redis et latences. Healthcheck Docker câblé sur l'API et le web.
- **3.4 Logging structuré + correlation ID** — Nouveaux middlewares
  `RequestIdMiddleware` (reprend `X-Request-Id` upstream ou génère un UUID) et
  `HttpLoggerMiddleware` (log JSON à chaque requête terminée, niveau selon le
  statut). L'en-tête `X-Request-Id` est renvoyé au client.

### Base de données
- **5.1 Index composites** — Migration `0007_performance_indexes` :
  `charge(status,dueDate)`, `charge(accountId,dueDate)`, `charge(accountId,status)`,
  `payment(accountId,paidAt)`, `payment(accountId,status)`,
  `occupancy(accountId,status)`, `occupancy(chargesGeneratedUntil)`.

### Frontend
- **4.1 Error Boundary** — Nouveau composant `components/ErrorBoundary.tsx`,
  monté en racine dans `main.tsx`. Écran de repli propre avec boutons
  « Réessayer » et « Recharger », stack trace visible uniquement en dev,
  hook pour Sentry prévu.
- **4.3 Toasts globaux** — Nouveau `components/Toast.tsx` (provider zéro-dépendance,
  `useToast().success|error|info|warning`). `ToastProvider` monté dans `main.tsx`.

### Infrastructure
- **6.1 Pipeline CI/CD** — `.github/workflows/ci.yml` : jobs `lint-typecheck`,
  `test` (avec Postgres + Redis services), `build` (artifact `web-dist`),
  `docker` (buildx avec cache GHA, uniquement sur `main`).
- **5.4 Backup PostgreSQL** — `scripts/backup-postgres.sh` : dump quotidien
  compressé + rétention + push S3 optionnel. À planifier via cron.

## À faire — Phase 2+

Voir l'audit complet dans l'artifact Claude Docs.
Prochaines étapes recommandées :
- **1.2** Migration JWT vers cookies HttpOnly (infrastructure préparée dans `env.ts`)
- **2.1** Correction des N+1 dans `maintenance.service.ts`
- **2.2** Pagination sur les endpoints de liste
- **6.4** Intégration Sentry (hook déjà en place dans `ErrorBoundary.tsx`)
- **8.1** Vrai provider SMS/WhatsApp (Africa's Talking recommandé pour le Cameroun)
