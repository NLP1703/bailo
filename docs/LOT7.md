# Bailo — Lot 7 · Fichiers (liens signés) & édition des modèles

Finalisation des deux points MVP restés « API à faire / sans UI » après le Lot 6
(cf. section « Reste » de `LOT6.md`) :

1. **Stockage objet avec liens signés** (NF8, F3.1, F6.2, F8.1).
2. **Édition des modèles de messages / contrat / reçu** (F7.2).

## 1. Module `files` (API) — SigV4 sans dépendance

L'env S3/MinIO était déjà déclaré mais aucun code ne signait d'URL. Ajout d'un presigner
**AWS Signature V4** maison (`node:crypto`, zéro dépendance externe), compatible MinIO
(path-style) comme AWS S3 (virtual-hosted).

| Élément                                               | Fichier                                          |
| ----------------------------------------------------- | ------------------------------------------------ |
| Presigner pur (PUT/GET, UNSIGNED-PAYLOAD)             | `apps/api/src/modules/files/sigv4.ts`            |
| Test (reproduit la signature de référence AWS)        | `apps/api/src/modules/files/sigv4.spec.ts`       |
| Service : clés préfixées par compte, garde NF7        | `apps/api/src/modules/files/storage.service.ts`  |
| `POST /files/upload-url` · `POST /files/download-url` | `apps/api/src/modules/files/files.controller.ts` |
| DTO partagés + usages de fichier                      | `packages/shared/src/dto/files.ts`               |

- **Clé objet** : `accounts/{accountId}/{purpose}/{uuid}.{ext}`. Le téléchargement refuse
  toute clé n'appartenant pas au compte courant (cloisonnement NF7).
- **L'API ne transfère jamais les fichiers** : elle signe, le navigateur dépose/lit
  directement. `S3_ENDPOINT` doit donc être **joignable par le navigateur** — corrigé dans
  `docker-compose.yml` (`S3_PUBLIC_ENDPOINT`, défaut `http://localhost:9000`), documenté
  dans `.env.example`.

## 2. Uploads câblés dans le front

Composant réutilisable `FileField` (`apps/web/src/components/FileField.tsx`) + helper
`lib/upload.ts` (demande d'URL signée → PUT direct → renvoie la clé).

| Écran           | Usage                        | Champ envoyé                          |
| --------------- | ---------------------------- | ------------------------------------- |
| Encaisser       | `payment-proof`              | `payment.proofKey` (F6.2)             |
| Dépenses        | `expense-attachment`         | `expense.attachmentKey` (F8.1)        |
| Nouvelle entrée | `tenant-photo` / `tenant-id` | `tenant.photoKey` / `idDocKey` (F3.1) |

Hors-ligne : la preuve est simplement omise (le paiement, lui, reste mis en file et
synchronisé — NF3 inchangé).

## 3. Écran « Modèles de messages » (F7.2)

`apps/web/src/screens/Templates.tsx` (route `/templates`, menu **Plus**, OWNER).
Édition par **type** (relance / contrat / reçu), **langue** (FR/EN) et **palier** de relance
(J-3, J0, J+5, J+15, fin d'avance), avec rappel des variables `{nom} {chambre} {montant}
{date}`. S'appuie sur l'API `GET/PUT /templates` existante ; le modèle enregistré devient
le `isDefault` utilisé par `TemplatesService.reminderBody`.

## 4. Profil du compte (F1.5) & médias du locataire

- **Profil du propriétaire** : nouveau module `account` (`GET /account`, `PATCH /account`
  OWNER) — `apps/api/src/modules/account/`. Champ `receiptFooter` ajouté à `Account`
  (migration `0002_account_receipt_footer`) pour les **mentions affichées sur les reçus**,
  désormais peuplées dans `receipts.service` (`buildReceiptHtml` supportait déjà `mentions`).
  UI dans **Paramètres** : nom affiché, mentions des reçus, **logo** (upload
  `account-logo` + aperçu signé).
- **Logo sur le reçu PDF** : `StorageService.fetchAsDataUri` récupère le logo **côté
  serveur** (nouvel endpoint `S3_INTERNAL_ENDPOINT`, joignable par le conteneur API) et
  l'inline en data-URL dans le reçu — comme le QR code. Aucune dépendance au navigateur.
- **Fiche locataire** : affichage de la **photo** (vignette) et de la **pièce d'identité**
  (type, numéro, lien signé « Voir la pièce ») via le composant `SignedImage` et des URLs
  signées à durée limitée (NF8).

## 5. Fiche d'unité & photos de chambre (F2.4)

- `GET /units/:id` (+ occupation active) et `photoKeys` ajouté à `updateUnitDto`.
- Écran `apps/web/src/screens/UnitEdit.tsx` (route `/units/:id`, OWNER/MANAGER) : édition
  code, type, loyer, charges incluses, partagée, capacité, statut, **équipements** et
  **photos** (upload `unit-photo`, grille avec retrait). Bouton « Encaisser » si la chambre
  est occupée.
- **Plan des chambres** : propriétaire/gérant → fiche de l'unité ; gardien → encaissement
  direct sur chambre occupée (parcours rapide inchangé).

## Vérifications (dans cet environnement)

- `pnpm lint` ✅ · `pnpm format:check` ✅
- typecheck **api** + **web** ✅
- tests unitaires : **shared 36** ✅ · **api 16** ✅ (dont `sigv4.spec` reproduisant la
  signature de référence AWS, et le logo/mentions du reçu)
- `vite build` ✅ (bundle ~**131 Ko gzip**, service worker généré)

## 6. Mise en route & tests d'intégration (Postgres local)

Exécution complète contre un Postgres réel : base créée, migrations `0000` → `0003`
appliquées, seed OK, **toutes les suites vertes** — shared **36**, API **16**, **e2e 20**
(auth, isolation multi-tenant, cœur financier, relances/tableau de bord/exports).

Deux correctifs rendus nécessaires par cette première exécution e2e (les e2e n'avaient
jamais tourné, faute de base) :

- **`class-validator` + `class-transformer`** ajoutés aux dépendances de l'API : le
  `ValidationPipe` global de NestJS (`main.ts`) les charge à l'exécution.
- **Migration `0003_allocation_sums_valid_only`** : le trigger de sécurité
  `check_allocation_sums` ne compte plus, pour une échéance, que les allocations de paiements
  **VALID** — alignement sur la définition métier du « payé » (`BalanceService`). Sans cela,
  un paiement **annulé** continuait à peser sur l'échéance et bloquait un nouveau paiement
  (RG8).
- Fixtures e2e rendues **indépendantes de la date** (une échéance « future » pour isoler le
  statut `PARTIAL` de `OVERDUE`, dont la précédence est intentionnelle — RG7/RG10).

> Les identifiants et la base locale sont dans `.env` (non versionné). Base de test dédiée
> `bailo_test` (les e2e la vident à chaque test — la base `bailo` de démo reste intacte).

## Reste (hors MVP)

Tout le périmètre MVP du cahier des charges est couvert. Restent les fonctionnalités **V2**
(paiement en ligne, sous-compteurs, réservations, incidents, relances automatiques par API
WhatsApp Business), explicitement « à ne pas coder maintenant ».
