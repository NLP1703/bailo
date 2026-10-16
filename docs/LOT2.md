# Bailo — Lot 2 · Socle

Authentification OTP, utilisateurs & rôles, multi-tenant, sites, chambres,
locataires, garants — avec tests d'isolation. (Le README complet arrive au Lot 5.)

## Ce qui est livré

**Infrastructure commune (`apps/api/src/common/`)**

- `prisma/` — `PrismaService` + **middleware de cloisonnement** `account-scope.ts` :
  filtrage systématique par `accountId` (NF7) sur toute lecture/écriture d'un modèle scopé.
- `tenancy/` — contexte de requête (AsyncLocalStorage), `TenancyMiddleware` (pose le
  contexte depuis le JWT), `SiteAccessService` (restriction gérant/gardien aux sites assignés).
- `auth/` — `JwtAuthGuard` (global), `RolesGuard` (global, matrice §2.1), décorateurs
  `@Public()`, `@Roles()`, `@CurrentUser()`.
- `validation/ZodValidationPipe` (schémas partagés `@bailo/shared`), `http/PrismaExceptionFilter`
  (P2002→409, P2025→404 — un accès inter-comptes échoue en 404).

**Modules métier (`apps/api/src/modules/`)**

- `auth` — OTP (SMS factice `console` en dev), signup (compte + propriétaire), login
  (téléphone + mot de passe, anti-force-brute), refresh **avec rotation**, reset par OTP, logout.
- `sms` — fournisseur derrière une interface (`SmsProvider`), impl. `ConsoleSmsProvider`.
- `users` — invitation gérant/gardien + sites assignés, liste, modification, `/me`.
- `sites` — sites, blocs, portée par site.
- `units` — création unitaire + **en série** (« A01→A24 »), plan coloré (RG18, version Lot 2).
- `tenants` — locataires, garants (payeur principal unique), recherche nom/téléphone.

**Base**

- `prisma/migrations/0000_init` — schéma complet (15 tables métier + techniques).
- `prisma/migrations/0001_constraints` — **RG17** (exclusion GIST anti-chevauchement via
  colonne dénormalisée maintenue par trigger) + intégrité des allocations (RG6/RG7).

**Docker** — `docker-compose.yml` (postgres, redis, minio + bucket, api, caddy), `apps/api/Dockerfile`
(build multi-étapes, `migrate deploy` à l'entrée), `Caddyfile` (HTTPS auto en prod).
Le service `web` est câblé au Lot 4 (le front n'a pas encore de sources).

## Décisions de cloisonnement (NF7)

Double protection :

1. **Explicite** — chaque écriture porte `accountId` (contexte courant), chaque service filtre par compte.
2. **Filet ORM** — le middleware Prisma force `accountId` sur toute requête scopée : même un
   appel qui « oublierait » le filtre reste cloisonné. Un `update`/`delete` visant la donnée
   d'un autre compte échoue (P2025 → 404), comme si elle n'existait pas.

## Démarrer en local

```bash
cp .env.example .env            # renseigner les secrets JWT
docker compose up -d postgres redis minio minio-init

# Dépendances + client Prisma + build du package partagé
corepack pnpm install
corepack pnpm --filter @bailo/shared build
corepack pnpm --filter @bailo/api prisma:generate
corepack pnpm --filter @bailo/api exec prisma migrate deploy   # applique 0000 + 0001

corepack pnpm --filter @bailo/api dev      # API sur http://localhost:3000/api/v1
```

Doc OpenAPI : `http://localhost:3000/api/docs`.
En OTP `console`, le code s'affiche dans les logs de l'API.

Ou tout en conteneurs : `docker compose up --build`.

## Tests

```bash
corepack pnpm --filter @bailo/api test        # unitaires (13, sans DB)
corepack pnpm --filter @bailo/api test:e2e    # e2e — nécessite Postgres joignable
```

Tests unitaires : middleware de cloisonnement, durée des tokens, couleur d'unité (RG18).
Tests e2e (`apps/api/test/`) :

- `auth.e2e` — inscription via OTP, login OK/KO, **rotation du refresh** (ancien invalidé), reset.
- `isolation.e2e` — **aucun accès croisé A↔B même par l'API**, gardien bloqué (site/users/tenant),
  gérant limité à ses sites assignés.

## Reste à faire (lots suivants)

- Lot 3 : occupations, échéances (RG1–RG4), affectation (RG5–RG7), reçus PDF, caisse, sortie,
  audit financier (RG21), **vue SQL `unit_status_v`** pour la couleur RG18 complète.
- Recherche locataire par n° de chambre (nécessite les occupations) — Lot 3.
- ESLint/Prettier + CI GitHub Actions — Lot 5.
