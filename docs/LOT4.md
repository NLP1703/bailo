# CitéGest — Lot 4 · Relances et suivi

Relances du jour (RG11–RG13), modèles FR/EN, tableau de bord, impayés, exports,
endpoints de synchronisation hors-ligne, et jobs planifiés (BullMQ).

> **Front PWA (Dexie + service worker)** : le serveur du mode hors-ligne est livré ici
> (`/sync/push` idempotent, `/sync/pull?since=`). Le glue IndexedDB/SW côté `apps/web`
> est posé avec l'échafaudage front (comme le service `web` du docker-compose).

## Domaine pur ajouté (`packages/shared/src/domain/reminders.ts`)

| Règle | Fonction                                                                                                       |
| ----- | -------------------------------------------------------------------------------------------------------------- |
| RG11  | `dueReminderStage` / `stageForDaysPastDue` / `isStageEnabled` — paliers J-3, J0, J+5, J+15 activables par site |
| RG12  | `isQuietHours` (pas d'envoi 21 h–7 h) ; pas de relance si échéance payée                                       |
| RG13  | `isEndOfAdvanceDay` — rappel 30 j avant la fin de couverture                                                   |
| F7.2  | `renderTemplate` — variables `{nom} {chambre} {montant} {date}`                                                |

**+7 tests de domaine** (35 au total côté shared).

## Modules API

- `modules/templates` — modèles **FR/EN** (relance/contrat/reçu), `GET/PUT /templates`,
  un seul « par défaut » par (type, langue, palier), messages intégrés par défaut.
- `modules/reminders` — **relances du jour** (`GET /reminders/today`) : génère (idempotent,
  1 par échéance+palier) puis liste par palier ; **envoi** (`POST /reminders/:id/sent`),
  **historique** (`GET /reminders`), **lien wa.me pré-rempli** (`GET /reminders/:id/wa-link`).
- `modules/expenses` — dépenses par site/catégorie (F8.1).
- `modules/reports` — **tableau de bord** (`GET /dashboard` : attendu, encaissé, reste,
  taux de recouvrement & d'occupation, par mode, par encaisseur, recettes−dépenses par site,
  top impayés), **impayés** (`GET /reports/arrears`), **exports CSV/PDF**
  (`GET /exports/payments|arrears|tenants`).
- `modules/sync` — **`POST /sync/push`** (rejoue la file hors-ligne, idempotent sur `clientId`)
  et **`GET /sync/pull?since=`** (delta des entités pour le cache local).
- `modules/jobs` — **maintenance quotidienne** (BullMQ) : bascule des retards (RG10),
  génération des relances (RG11–RG13), **extension auto des échéances** sans fin prévue (RG1).

## Choix notables

- **Exports** : CSV (séparateur `;` + BOM UTF-8, ouvrable dans Excel) par défaut, et **PDF**
  via le renderer du Lot 3 (repli HTML sans Chromium). Un vrai `.xlsx` (exceljs) est une
  amélioration possible ; le CSV satisfait le critère « l'export contient tous les paiements ».
- **Jobs** : désactivés par défaut (`ENABLE_JOBS=false`) pour démarrer l'API sans Redis en dev.
  La logique vit dans `MaintenanceService` (appelable directement), BullMQ ne fait que la planifier.
  Le job tourne **sans contexte compte** (données de tous les comptes) — c'est voulu pour un job système.
- **RG13 (fin d'avance)** : règle de domaine prête ; sa génération systématique sera branchée
  dans la maintenance quand le calcul de couverture par occupation sera matérialisé.

## Tests

```bash
corepack pnpm --filter @citegest/shared test   # 35 tests de domaine (RG1–RG18)
corepack pnpm --filter @citegest/api test       # 12 tests unitaires
corepack pnpm --filter @citegest/api test:e2e   # nécessite Postgres
```

`test/suivi.e2e.spec.ts` valide : **relances du jour** (J-3, wa-link, envoi, plus de
réapparition une fois envoyée — RG12), **tableau de bord** (attendu/encaissé/reste/recouvrement,
par mode), **impayés**, **export CSV**, **recettes−dépenses par site**.

## Reste (Lot 5)

Import Excel des locataires, seed réaliste (1 compte, 2 sites, 60 chambres, 45 locataires,
6 mois d'historique), échafaudage **front React/PWA** (Dexie offline, i18n, 12 écrans),
README « une commande », CI GitHub Actions, revue finale des critères d'acceptation.
