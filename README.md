# Bailo

Gestion locative pour **cités étudiantes et immeubles** au Cameroun : chambres, locataires,
loyers, **avances et paiements partiels**, reçus PDF, relances WhatsApp, caisse du gardien,
tableau de bord — PWA mobile d'abord, hors-ligne, FR/EN, FCFA.

> **Accès réservé** aux bailleurs et à leurs équipes (propriétaire, gérant, gardien).
> Les locataires et parents n'ont **aucun accès** : ils reçoivent seulement reçus et rappels.

## Démarrer en une commande

```bash
cp .env.example .env          # renseigner les secrets JWT (JWT_ACCESS_SECRET, JWT_REFRESH_SECRET)
docker compose up --build
```

- Front PWA : http://localhost (via Caddy)
- API : http://localhost/api/v1 · Docs OpenAPI : http://localhost/api/docs
- MinIO console : http://localhost:9001 · PostgreSQL : `localhost:5432`

L'API applique les migrations (`prisma migrate deploy`) au démarrage. Pour des données de démo :

```bash
docker compose exec api node node_modules/.bin/tsx prisma/seed.ts
# ou en local : corepack pnpm --filter @bailo/api seed
```

**Comptes de test** (après seed, mot de passe `demo1234`) :
Propriétaire `690000000` · Gérant `690000001` · Gardien `690000002`.

## Développement local (sans Docker pour l'app)

```bash
corepack pnpm install
docker compose up -d postgres redis minio minio-init   # dépendances uniquement
corepack pnpm --filter @bailo/shared build
corepack pnpm --filter @bailo/api prisma:generate
corepack pnpm --filter @bailo/api exec prisma migrate deploy
corepack pnpm --filter @bailo/api dev    # API  → http://localhost:3000
corepack pnpm --filter @bailo/web dev    # Front → http://localhost:5173
```

## Architecture

Monorepo pnpm, TypeScript strict de bout en bout.

| Paquet            | Rôle                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------ |
| `packages/shared` | Types, schémas **Zod** et **règles de gestion pures** (RG1–RG18) partagés front/back       |
| `apps/api`        | API **NestJS** + **Prisma/PostgreSQL** + **BullMQ/Redis** + PDF + S3/MinIO                 |
| `apps/web`        | **React + Vite + Tailwind** en **PWA** (hors-ligne via Dexie + service worker), i18n FR/EN |

- **Multi-tenant (NF7)** : tout est cloisonné par `account_id` (middleware Prisma + filtrage explicite).
- **Un paiement n'est jamais une échéance** : `charge` (dû) ↔ `allocation` ↔ `payment` (reçu).
- **RG17** (pas de chevauchement) garanti en base par contrainte d'exclusion GIST.
- **Hors-ligne (NF3)** : paiements saisis hors-ligne mis en file (Dexie) avec `clientId`,
  rejoués au retour du réseau — **idempotents**, jamais de doublon.

Détails par lot : [`docs/LOT2.md`](docs/LOT2.md) · [`docs/LOT3.md`](docs/LOT3.md) ·
[`docs/LOT4.md`](docs/LOT4.md) · [`docs/LOT5.md`](docs/LOT5.md) ·
cadrage initial [`docs/CADRAGE.md`](docs/CADRAGE.md) ·
critères d'acceptation [`docs/ACCEPTATION.md`](docs/ACCEPTATION.md).

## Tests

```bash
corepack pnpm --filter @bailo/shared test   # règles de gestion (RG1–RG18)
corepack pnpm --filter @bailo/api test        # unitaires API
corepack pnpm --filter @bailo/api test:e2e    # e2e (nécessite Postgres)
```

## Variables d'environnement

Toutes documentées dans [`.env.example`](.env.example) : base, Redis/jobs, JWT/OTP,
S3/MinIO, PDF/reçus, front (`VITE_*`). En production, renseigner des secrets forts et
un vrai fournisseur SMS (`SMS_PROVIDER`).

## Contraintes réglementaires

Bailo **ne détient ni ne reverse jamais** l'argent des loyers (hors champ BEAC/COBAC) :
l'argent va directement au bailleur ; la plateforme ne fait que tracer.
