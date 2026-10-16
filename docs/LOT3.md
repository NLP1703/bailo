# Bailo — Lot 3 · Cœur financier

Occupations, échéances, affectation des paiements, reçus PDF, caisse, sortie,
journal d'audit — avec les règles de gestion RG1–RG18 en module de domaine pur testé.

## Principe

**Un paiement n'est jamais une échéance.** Les échéances (`charge`) disent ce qui est dû,
les paiements (`payment`) ce qui est reçu, les allocations (`allocation`) relient les deux.
Le « payé » d'une échéance = Σ des allocations de paiements **VALID** (les annulés sont exclus).

## Domaine pur (`packages/shared/src/domain/`) — testé sans I/O

| Fichier         | Règles    | Rôle                                                                                        |
| --------------- | --------- | ------------------------------------------------------------------------------------------- |
| `schedule.ts`   | RG1–RG4   | Génération des loyers (fin prévue ou 12 mois), jour d'échéance ≤ 28, 1er mois plein/prorata |
| `allocation.ts` | RG5–RG7   | Affectation FIFO (plus ancien d'abord), excédent en avance, validation manuelle             |
| `arrears.ts`    | RG7, RG10 | Statut calculé d'une échéance (payée/partielle/due/à venir/en retard) + délai de grâce      |
| `closeout.ts`   | RG15      | caution − impayés − retenues = à rembourser (ou reste dû)                                   |
| `receipt.ts`    | RG9       | Format `CG-AAAA-NNNNNN`                                                                     |
| `unit-color.ts` | RG18      | Couleur d'unité (rouge/orange/vert/gris/bleu)                                               |
| `dates.ts`      | RG3/RG4   | Helpers calendaires UTC                                                                     |

**28 tests de domaine** couvrant notamment les critères d'acceptation P2 (175 000 → caution + 6 loyers),
paiement partiel (reste 15 000), retards, clôture, RG18.

## Modules API (`apps/api/src/`)

- `common/audit` — **journal d'audit (RG21)** écrit dans la même transaction que l'opération.
- `modules/finance` — `BalanceService` (soldes/statuts dérivés) + `ReceiptNumberService` (RG9 atomique).
- `modules/occupancies` — **nouvelle entrée** (échéances + caution + paiement d'ouverture, transaction unique),
  préavis, **clôture** (annule les loyers futurs, calcule la caution — RG15/RG16).
- `modules/charges` — échéances ponctuelles (eau, électricité, frais…), **annulation motivée** (F5.5).
- `modules/payments` — **encaissement idempotent** (`clientId`, NF3), affectation auto/manuelle,
  **annulation par écriture** (RG8, jamais de suppression), aperçu d'affectation.
- `modules/receipts` + `modules/pdf` — **reçu PDF** (HTML→PDF Puppeteer, QR de vérification) et
  **page de vérification publique** (`/receipts/verify/:id` — authentique/non, n°, montant, date **seulement**).
- `modules/cash` — **journal de caisse** par encaisseur + **remise** (attendu/remis/écart, F6.6).

Le plan des chambres (`GET /units`) calcule désormais la **couleur RG18 complète**.

## Choix notables

- **RG18** est calculé via la règle de domaine partagée (`computeUnitColor`), source unique
  testée, plutôt qu'une vue SQL — cela évite toute divergence TS/SQL. La vue SQL reste une
  optimisation possible si le plan devient un goulot (NF2).
- **PDF / QR** derrière des interfaces : Puppeteer et `qrcode` sont chargés paresseusement
  (dépendances **optionnelles**). Sans Chromium (dev/test), le reçu est rendu en **HTML** ;
  la prod installe Chromium (cf. `apps/api/Dockerfile`).
- **RG17** (pas deux occupations actives chevauchantes sur une chambre non partagée) est
  garanti **en base** par la contrainte d'exclusion GIST (`migrations/0001_constraints`).
- **Paiement d'ouverture** : à l'entrée, on encaisse caution + avance (N mois ou montant) en un
  seul paiement, affecté FIFO (caution d'abord) — reproduit exactement le parcours P2.

## Tests

```bash
corepack pnpm --filter @bailo/shared test   # 28 tests de domaine (RG1–RG18)
corepack pnpm --filter @bailo/api test       # 12 tests unitaires (dont reçu HTML)
corepack pnpm --filter @bailo/api test:e2e   # nécessite Postgres
```

`test/payments.e2e.spec.ts` valide sur la vraie base : P2 (175 000), partiel (reste 15 000),
**idempotence** (3 renvois = 1 paiement), **annulation** (visible + motif, solde recalculé,
numéro non réutilisé), **gardien ne peut pas annuler**, **RG17** (chevauchement refusé),
vérification de reçu (authentique puis non après annulation).

## Reste pour les lots suivants

- Lot 4 : relances du jour (RG11–RG13), modèles FR/EN, **tableau de bord** & impayés, exports,
  mode hors-ligne (Dexie + file de sync). Les jobs BullMQ (bascule des retards, génération de
  relances, extension auto des échéances RG1) y sont branchés.
- Lot 5 : import Excel, seed réaliste, page publique de vérification (front), README, CI.
