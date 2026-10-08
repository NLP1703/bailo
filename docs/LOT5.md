# CitéGest — Lot 5 · Finitions

Import des locataires, seed réaliste, **échafaudage front React/PWA**, page publique de
vérification de reçu, README « une commande », CI, outillage qualité.

## Import des locataires (P1)

- `POST /tenants/import` (`ImportService`) : le front parse l'Excel/CSV « modèle » en lignes
  `{ name, unitCode, monthlyRent, startDate, paidUntil, … }` ; le serveur crée locataire +
  occupation + **paiement d'ouverture** couvrant les mois « déjà payé jusqu'au mois de… ».
- Réutilise la logique testée du Lot 3 (`OccupanciesService.create`, affectation FIFO) ;
  helper pur `rentCoveredAmount` (testé).

## Seed réaliste (`apps/api/prisma/seed.ts`)

1 compte · propriétaire + gérant + gardien · 2 sites · **60 chambres** (blocs A/B + studios)
· **45 locataires** occupants · **~6 mois d'historique** varié : à jour, partiels, 3 mois
d'avance, retards · dépenses · séquences de reçus (RG9).
Comptes de test (`demo1234`) : `690000000` / `690000001` / `690000002`.

## Front React / PWA (`apps/web`)

- **Vite + React + TypeScript + Tailwind**, **PWA** installable (service worker, manifeste,
  cache réseau-d'abord des GET API), **i18n FR/EN**, mobile d'abord (max-w-md), FCFA & dates Douala.
- **Hors-ligne (NF3)** : `lib/db.ts` (Dexie — cache + file d'attente `outbox`), `lib/sync.ts`
  (push idempotent par `clientId` + pull delta, resync au retour réseau), badge « hors ligne »
  et compteur « en attente ».
- **Auth** : contexte avec login, `/me`, rotation du refresh transparente.
- **Écrans fonctionnels** : Connexion, Accueil (tableau de bord), Plan des chambres (couleurs
  RG18), **Encaisser** (aperçu d'affectation + validation en ligne **ou mise en file hors-ligne**),
  Relances du jour (WhatsApp + marquer envoyée), Impayés (export CSV authentifié),
  **Vérification publique de reçu** `/r/:id`. Les autres écrans (fiche locataire, nouvelle
  entrée, dépenses, caisse, sortie, paramètres) sont des **stubs** reliés à la navigation.
- Build vérifié : bundle ~**124 Ko gzip** (NF2), service worker généré.

> Les stubs restants sont à compléter dans une itération front dédiée ; l'API et les
> schémas partagés nécessaires existent déjà.

## Vérification de reçu (F6.4)

API `GET /receipts/verify/:id` (public) + page front `/r/:id` : affiche **uniquement**
authentique/non, numéro, montant, date — aucune autre donnée personnelle.

## Qualité & CI

- **ESLint 9** (flat config, typescript-eslint, `no-explicit-any`) + **Prettier** : tout le
  dépôt passe `pnpm lint` et `pnpm format:check`.
- **TypeScript strict** partout : `pnpm typecheck` (shared + api + web).
- **CI GitHub Actions** (`.github/workflows/ci.yml`) :
  - `quality` : install, build shared, prisma generate, lint, format:check, typecheck,
    tests unitaires, build PWA.
  - `e2e` : service PostgreSQL, `migrate deploy`, `test:e2e`.
  - `images` : build des images Docker api + web.
- **Docker Compose** complet : postgres, redis, minio (+bucket), api, **web (nginx)**, caddy
  (reverse proxy + HTTPS auto). `docker compose up --build` lance toute la pile.

## État des vérifications (dans cet environnement)

| Vérification                                  | Résultat                                      |
| --------------------------------------------- | --------------------------------------------- |
| `pnpm lint`                                   | ✅                                            |
| `pnpm format:check`                           | ✅                                            |
| typecheck shared + api (+ tests + seed) + web | ✅                                            |
| tests unitaires (shared 36 + api 12 = **48**) | ✅                                            |
| build front PWA (`vite build`)                | ✅ (~124 Ko gzip, SW généré)                  |
| graphe DI NestJS complet                      | ✅                                            |
| tests e2e (`test:e2e`)                        | écrits ; nécessitent Postgres (non dispo ici) |
| `docker compose` / migrations                 | écrits ; Docker non dispo ici                 |

## Couverture des critères d'acceptation

Voir [`ACCEPTATION.md`](ACCEPTATION.md) : chaque critère → implémentation → test.
