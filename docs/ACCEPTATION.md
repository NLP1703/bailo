# Critères d'acceptation — couverture

Chaque critère du cahier des charges, son implémentation et le test qui le couvre.
(e2e = nécessite Postgres ; unit = exécutable partout.)

| Critère                                                                             | Implémentation                                                     | Test                                                      |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------- |
| Paiement 175 000 = caution + 6 loyers passent « payée » (P2, RG5/RG6)               | `domain/allocation` + `OccupanciesService.create`                  | `allocation.spec` (unit) · `payments.e2e`                 |
| 10 000 sur 25 000 → « partiellement payée », reste 15 000 (RG7)                     | `domain/allocation` + `BalanceService`                             | `allocation.spec` (unit) · `payments.e2e`                 |
| Paiement hors-ligne renvoyé 3× = 1 seul (NF3)                                       | `payment.clientId` unique + `PaymentsService.recordTx` idempotent  | `payments.e2e`                                            |
| Paiement annulé visible + motif, solde recalculé, n° non réutilisé (RG8/RG9)        | `PaymentsService.void` (écriture d'annulation) + `ReceiptSequence` | `payments.e2e`                                            |
| Relances du jour = bonnes échéances, aucune déjà payée (RG11/RG12)                  | `domain/reminders` + `RemindersService`                            | `reminders.spec` (unit) · `suivi.e2e`                     |
| Reçu PDF + QR → page de vérification (F6.4)                                         | `receipts` (`renderPayment`, `verify`) + front `/r/:id`            | `receipt-html.spec` (unit) · `payments.e2e` · `suivi.e2e` |
| Un gardien ne peut ni annuler un paiement ni voir le tableau de bord (matrice §2.1) | `RolesGuard` + `@Roles` sur `void` / `dashboard`                   | `payments.e2e` · `isolation.e2e`                          |
| Aucun accès croisé entre comptes, même par l'API (NF7)                              | middleware `account-scope` + filtrage explicite                    | `account-scope.spec` (unit) · `isolation.e2e`             |
| Deux occupations actives ne se chevauchent pas sur une chambre non partagée (RG17)  | contrainte d'exclusion GIST (`0001_constraints`)                   | `payments.e2e`                                            |
| Clôture : caution − impayés − retenues = à rembourser (RG15)                        | `domain/closeout` + `OccupanciesService.close`                     | `arrears.spec` (unit)                                     |
| Totaux du tableau de bord = Σ paiements/échéances du mois (F11.1)                   | `ReportsService.dashboard`                                         | `suivi.e2e`                                               |
| Export Excel/CSV contient tous les paiements de la période (F11.5)                  | `ExportsService` (CSV + PDF)                                       | `suivi.e2e`                                               |
| Mise en service < 15 min : import des locataires (P1)                               | `ImportService` (`/tenants/import`) + `rentCoveredAmount`          | `schedule.spec` (unit)                                    |
| Page d'accueil < 3 s en 3G (NF2)                                                    | PWA, bundle ~124 Ko gzip, cache réseau-d'abord                     | build Vite (mesuré)                                       |
| Sauvegarde restaurée (NF9)                                                          | procédure documentée (hors app)                                    | manuel                                                    |

## Règles de gestion RG1–RG18 — tests unitaires de domaine

`packages/shared/src/domain/__tests__/` :

- **schedule.spec** — RG1 (génération mensuelle), RG2 (montant figé), RG3 (jour ≤ 28),
  RG4 (prorata / plein), `rentCoveredAmount` (import).
- **allocation.spec** — RG5 (FIFO), RG6 (avance / pas de crédit flottant), RG7 (payée/partielle).
- **arrears.spec** — RG7/RG10 (statuts + délai de grâce), RG15 (clôture), RG18 (couleur), RG9 (n° reçu).
- **reminders.spec** — RG11 (paliers), RG12 (fenêtre 21 h–7 h, payée), RG13 (fin d'avance), F7.2 (variables).

## Lancer la vérification complète

```bash
corepack pnpm --filter @citegest/shared test     # RG1–RG18 (unit)
corepack pnpm --filter @citegest/api test          # unit API
docker compose up -d postgres
corepack pnpm --filter @citegest/api exec prisma migrate deploy
corepack pnpm --filter @citegest/api test:e2e      # parcours complets
```
