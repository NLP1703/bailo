# CitéGest — Lot 1 · Cadrage

Document de cadrage du MVP. Fait référence au cahier des charges v1.0 (`@obelix`).
Il contient : l'arborescence du monorepo, le schéma de données, la liste des routes API,
et les maquettes textuelles des 12 écrans. **Aucun code applicatif n'est écrit dans ce lot.**

---

## 1. Arborescence du monorepo

Monorepo pnpm, 3 packages : `apps/api` (NestJS), `apps/web` (React/Vite PWA),
`packages/shared` (types + schémas Zod partagés front/back).

```
citegest/
├─ package.json                 # racine, scripts pnpm -r
├─ pnpm-workspace.yaml
├─ tsconfig.base.json           # config TS stricte héritée
├─ .env.example                 # variables documentées
├─ .gitignore
├─ docker-compose.yml           # api, web, postgres, redis, minio, caddy (Lot 2)
├─ .github/workflows/ci.yml     # lint, tests, build images (Lot 5)
├─ docs/
│  └─ CADRAGE.md                # ce document
│
├─ packages/
│  └─ shared/
│     ├─ package.json
│     ├─ tsconfig.json
│     └─ src/
│        ├─ index.ts
│        ├─ enums.ts            # UserRole, ChargeType, PaymentMode… (miroir Prisma)
│        ├─ dto/               # schémas Zod : auth, sites, units, tenants,
│        │                     #   occupancies, payments, reminders, expenses…
│        ├─ domain/            # RÈGLES DE GESTION PURES (RG1..RG18), sans I/O
│        │  ├─ schedule.ts     # génération d'échéances (RG1..RG4)
│        │  ├─ allocation.ts   # affectation paiement→échéances (RG5..RG7)
│        │  ├─ arrears.ts      # calcul retard / statut (RG10)
│        │  ├─ reminders.ts    # paliers J-3..J+15, fenêtre horaire (RG11..RG13)
│        │  ├─ closeout.ts     # clôture & caution (RG14, RG15)
│        │  └─ money.ts        # FCFA entier, formatage (RG22)
│        └─ domain/__tests__/  # tests unitaires Vitest des RG
│
├─ apps/api/
│  ├─ package.json
│  ├─ tsconfig.json
│  ├─ nest-cli.json
│  ├─ prisma/
│  │  ├─ schema.prisma         # ✅ livré (Lot 1)
│  │  ├─ manual/001_constraints.sql  # ✅ livré (exclusion RG17, checks alloc.)
│  │  └─ seed.ts               # seed réaliste (Lot 5)
│  └─ src/
│     ├─ main.ts               # bootstrap + Swagger/OpenAPI
│     ├─ app.module.ts
│     ├─ common/
│     │  ├─ prisma/            # PrismaService + middleware account_id
│     │  ├─ auth/              # guards JWT, RolesGuard, SiteAccessGuard
│     │  ├─ tenancy/           # AccountContext (CLS), garde multi-tenant
│     │  └─ audit/             # intercepteur d'audit (RG21)
│     └─ modules/
│        ├─ auth/              # OTP, login, refresh
│        ├─ users/             # invitation gérant/gardien, user_site
│        ├─ sites/  units/  blocks/
│        ├─ tenants/  guarantors/
│        ├─ occupancies/       # entrée, préavis, clôture
│        ├─ charges/
│        ├─ payments/          # encaissement, void, reçu PDF
│        ├─ cash/              # journal de caisse, remise
│        ├─ reminders/
│        ├─ expenses/
│        ├─ reports/           # dashboard, impayés, exports
│        ├─ sync/              # push/pull hors-ligne
│        ├─ files/             # liens signés S3/MinIO
│        ├─ pdf/               # rendu HTML→PDF (Puppeteer) + QR
│        ├─ receipts/          # page publique de vérification
│        └─ jobs/              # BullMQ : échéances, retards, relances, PDF
│
└─ apps/web/
   ├─ package.json
   ├─ vite.config.ts           # + vite-plugin-pwa
   ├─ tailwind.config.ts
   ├─ index.html
   └─ src/
      ├─ main.tsx
      ├─ app/                  # router, layout, barre du bas
      ├─ i18n/                 # i18next fr/en
      ├─ lib/
      │  ├─ api/               # client REST typé (à partir de shared/dto)
      │  ├─ db/                # Dexie (IndexedDB), file de sync
      │  ├─ offline/           # service worker glue, file d'attente paiements
      │  └─ format/            # FCFA, dates JJ/MM/AAAA, Africa/Douala
      ├─ features/             # un dossier par écran (voir §4)
      └─ components/           # UI réutilisable (mobile-first 360px)
```

---

## 2. Modèle de données (résumé)

Schéma complet : `apps/api/prisma/schema.prisma`. 15 tables métier + tables techniques.

| Table                       | Rôle                           | Notes clés                                        |
| --------------------------- | ------------------------------ | ------------------------------------------------- |
| `account`                   | compte propriétaire            | `receiptPrefix`, `plan`                           |
| `user` + `user_site`        | utilisateurs et sites assignés | rôle OWNER/MANAGER/CARETAKER                      |
| `refresh_token`, `otp_code` | auth                           | OTP haché, tentatives limitées                    |
| `site`                      | site                           | `graceDays`, `prorataMode`, paliers relance       |
| `block`, `unit`             | blocs et unités                | `shared`, `capacity`, `manualStatus`              |
| `tenant` + `guarantor`      | fiches (aucun accès)           | `isPrimaryPayer`                                  |
| `occupancy`                 | occupation                     | `chargesGeneratedUntil`, `closeSummary`           |
| `charge`                    | échéance                       | montant figé (RG2), unique par période            |
| `payment`                   | paiement                       | `clientId` unique (anti-doublon), `receiptNumber` |
| `allocation`                | paiement ↔ échéance            | somme bornée (triggers)                           |
| `cash_handover`             | remise de caisse               | `expected`/`handed`/`variance`                    |
| `expense`                   | dépense                        | catégorie, pièce jointe                           |
| `reminder`                  | relance                        | unique (charge, stage)                            |
| `template`                  | modèles FR/EN                  | relance/contrat/reçu                              |
| `receipt_sequence`          | numérotation continue          | par (compte, année)                               |
| `audit_log`                 | journal non modifiable         | RG21                                              |

**Calculs dérivés (non stockés)** : payé d'une échéance = Σ allocations valides ;
solde occupation = Σ échéances échues − Σ allocations ; mois couverts = dernière échéance
loyer entièrement payée ; couleur unité (RG18) = **vue SQL** `unit_status_v`.

---

## 3. Routes API (REST, préfixe `/api/v1`)

Toutes les routes (sauf `auth/*` et la vérification publique de reçu) exigent un JWT et sont
filtrées par `account_id`. `[O]` propriétaire, `[G]` gérant, `[C]` gardien.

### auth (public)

| Méthode | Route                  | Rôle   | Description                                 |
| ------- | ---------------------- | ------ | ------------------------------------------- |
| POST    | `/auth/otp`            | public | Demander un OTP (signup/login/reset)        |
| POST    | `/auth/signup`         | public | Créer le compte + propriétaire (OTP validé) |
| POST    | `/auth/login`          | public | Téléphone + mot de passe → JWT + refresh    |
| POST    | `/auth/refresh`        | public | Renouveler le JWT                           |
| POST    | `/auth/password-reset` | public | Réinit. par OTP                             |
| POST    | `/auth/logout`         | auth   | Révoquer le refresh token                   |

### users

| POST | `/users/invite` | [O] | Inviter gérant/gardien (numéro, rôle, sites) |
| GET | `/users` | [O] | Lister les utilisateurs du compte |
| PATCH | `/users/:id` | [O] | Rôle, sites, activer/désactiver |
| GET | `/me` | auth | Profil courant + rôle + sites |

### sites / blocks / units

| GET·POST | `/sites` | [O][G] lire / [O][G] créer | Sites du compte |
| PATCH | `/sites/:id` | [O][G] | Modifier un site |
| GET·POST | `/sites/:id/blocks` | [O][G] | Blocs |
| POST | `/sites/:id/units/bulk` | [O][G] | Création en série (« A01→A24 à 25000 ») |
| GET | `/units?siteId=&blockId=&status=` | tous | Plan des chambres (couleur RG18) |
| POST | `/units` | [O][G] | Créer une unité |
| PATCH | `/units/:id` | [O][G] | Modifier une unité |

### tenants / guarantors

| GET·POST | `/tenants` | [O][G] | Locataires (recherche `?q=`) |
| GET·PATCH | `/tenants/:id` | tous lire / [O][G] modifier | Fiche + historique |
| POST | `/tenants/:id/guarantors` | [O][G] | Ajouter un garant |
| PATCH | `/guarantors/:id` | [O][G] | Modifier / payeur principal |
| POST | `/tenants/import` | [O][G] | Import Excel (Lot 5) |

### occupancies / charges

| POST | `/occupancies` | [O][G] | Nouvelle entrée (génère échéances RG1) |
| GET | `/occupancies/:id` | tous | Détail + soldes |
| POST | `/occupancies/:id/notice` | [O][G] | Enregistrer un préavis |
| POST | `/occupancies/:id/close` | [O][G] | Clôture + reçu de sortie (RG15) |
| GET | `/occupancies/:id/charges` | tous | Échéances |
| POST | `/charges` | [O][G] | Échéance ponctuelle (caution, eau…) |
| PATCH | `/charges/:id/cancel` | [O][G] | Remise/annulation (motif obligatoire) |

### payments / cash

| POST | `/payments` | [O][G][C] | Encaisser (idempotent sur `clientId`) |
| GET | `/payments/:id` | tous | Détail |
| POST | `/payments/:id/void` | [O][G] | Annuler avec motif (RG8) |
| GET | `/payments/:id/receipt` | tous | Reçu PDF (lien signé) |
| GET | `/payments/:id/allocation-preview` | [O][G][C] | Aperçu affectation avant validation |
| GET | `/cash?collectorId=&period=` | [O][G] / [C] sa caisse | Journal de caisse |
| POST | `/cash/handovers` | [O][G] | Enregistrer une remise |

### reminders

| GET | `/reminders/today` | [O][G] | Liste du jour par palier |
| POST | `/reminders/:id/sent` | [O][G] | Marquer envoyée |
| GET | `/reminders?tenantId=` | [O][G] | Historique |
| GET | `/reminders/:id/wa-link` | [O][G] | Lien `wa.me` pré-rempli |

### templates / expenses

| GET·PUT | `/templates` | [O] | Modèles message/contrat/reçu FR/EN |
| GET·POST | `/expenses` | [O][G] | Dépenses |

### reports / exports

| GET | `/dashboard?month=` | [O][G] | Indicateurs du mois (F11.1/3/4) |
| GET | `/reports/arrears` | [O][G] | Impayés triés |
| GET | `/exports/:type` | [O][G] | `payments` / `arrears` / `tenants` (Excel/PDF) |

### files / sync / receipts

| POST | `/files/presign` | auth | Lien signé d'upload (S3/MinIO) |
| GET | `/files/:key/url` | auth | Lien signé de lecture (durée limitée) |
| POST | `/sync/push` | auth | Envoi de la file hors-ligne |
| GET | `/sync/pull?since=` | auth | Delta pour cache local |
| GET | `/receipts/verify/:number` | **public** | Vérif. QR : authentique/non, n°, montant, date — **rien d'autre** |

---

## 4. Maquettes textuelles des 12 écrans

Mobile-first, cible 360 px. **Barre du bas** (5 onglets) : `Accueil · Chambres · Encaisser · Relances · Plus`.
Le gardien ne voit que `Chambres · Encaisser · Caisse (sa caisse) · Plus` (pas d'Accueil financier ni Relances).

### 1) Accueil — tableau de bord · `[O][G]`

```
┌ CitéGest              🔔  [Site ▾] ┐
│ Septembre 2026                     │
│ ┌───────────┬───────────┐          │
│ │ Attendu   │ Encaissé  │          │
│ │ 1 250 000 │   890 000 │          │
│ ├───────────┼───────────┤          │
│ │ Reste     │ Recouvr.  │          │
│ │   360 000 │    71 %   │          │
│ └───────────┴───────────┘          │
│ Taux d'occupation ▓▓▓▓▓▓░ 84 %     │
│                                    │
│ Top 5 impayés                      │
│ • Mballa · A12 · 45 000 · 32 j >   │
│ • Ngono · B03 · 30 000 · 18 j  >   │
│ …                                  │
│ Relances du jour (6)          [→]  │
├────────────────────────────────────┤
│ 🏠 Accueil 🚪 Ⓔ Encaisser 🔔 ⋯    │
└────────────────────────────────────┘
```

### 2) Plan des chambres · `tous`

```
[Site ▾]  [Bloc ▾]   Filtre: ⬤Tous 🟥🟧🟩⬜🟦
┌────────────────────────────┐
│ Bloc A                     │
│ 🟩A01 🟩A02 🟥A03 🟧A04    │
│ ⬜A05 🟦A06 🟩A07 🟩A08    │
│ Bloc B                     │
│ 🟩B01 🟥B02 ⬜B03 …        │
└────────────────────────────┘
Légende : 🟩 à jour  🟧 due <3j  🟥 en retard
          ⬜ libre  🟦 réservée
(tap sur une case → Fiche chambre)
```

### 3) Fiche chambre · `tous`

```
< A12 · Chambre · 25 000/mois
Statut : 🟥 en retard
Occupant : Paul Mballa  ☎ 6xx… >
Mois couverts jusqu'au : 08/2026
Solde dû : 45 000 FCFA
─ Échéances ──────────────
09/2026 loyer   25 000  🟥 en retard
08/2026 loyer   25 000  🟩 payée
Caution         25 000  🟩 payée
─ Historique paiements ───
12/08 · 25 000 · Espèces · reçu >
[   Encaisser sur cette chambre   ]
```

### 4) Fiche locataire · `[O][G]`

```
< Paul Mballa
☎ 6xx  ·  WhatsApp 6xx  ·  Étudiant
Pièce : CNI ····· [voir]
Garants
 • Mme Mballa (mère) — payeur principal ☎ >
Occupations
 • A12 · depuis 01/09/2026 · active >
Paiements (12) >   Relances (4) >
Notes ✎
```

### 5) Nouvelle entrée — assistant 3 étapes · `[O][G]`

```
Étape 1/3 · Chambre
[Rechercher une chambre libre ⌕]
🟩 A05  🟩 A07  🟩 B04 …
────────────────────────────
Étape 2/3 · Locataire
( ) Nouveau   ( ) Existant ⌕
Nom … ☎ … WhatsApp … Pièce 📷
+ Garant  ☑ payeur principal
────────────────────────────
Étape 3/3 · Conditions & avance
Loyer 25000  Caution 25000
Entrée 01/09/2026  Jour éch. 1
Avance : ( ) mois [6]  ( ) montant
Aperçu : caution + 6 loyers = 175 000
[ Créer + encaisser + contrat PDF ]
```

### 6) Encaisser · `tous` (objectif < 30 s)

```
[Rechercher nom ou chambre ⌕ « A12 »]
→ Paul Mballa · A12 · dû 45 000
Montant   [ 10 000 ]  FCFA
Mode  [Espèces ▾]  Réf. …  Date auj.
Preuve 📷 (facultatif)
─ Aperçu affectation ─────────
09/2026 loyer : 10 000 → reste 15 000
[      Valider l'encaissement      ]
(hors-ligne : ⏳ en file, reçu à la reconnexion)
→ Reçu CG-2026-000123  [WhatsApp] [SMS]
```

### 7) Relances du jour · `[O][G]`

```
Relances du jour · 6
J-3 (2)
 • Ngono · B03 · 30 000 · 03/10
   dest: ☑locataire ☑parent
   [ WhatsApp ]  [✓ envoyée]
J+5 (2)   J+15 (2)  …
Filtre destinataire · palier
Historique >
```

### 8) Impayés · `[O][G]`

```
Impayés   [Site ▾] [Tri: ancienneté ▾]
Total : 360 000 FCFA
• Mballa A12   45 000   32 j  >
• Ngono B03    30 000   18 j  >
• …
[ Exporter Excel ] [ Exporter PDF ]
```

### 9) Dépenses · `[O][G]`

```
Dépenses  [Site ▾]  Sept: 120 000
+ Saisie rapide
  Catégorie [Entretien ▾] Montant …
  Date … Pièce 📷  [Ajouter]
Liste
 • 05/09 Électricité 45 000 (Bloc A) >
 • 02/09 Plomberie   30 000 · A07  >
```

### 10) Caisse · `[O][G]` + `[C]` (sa caisse)

```
Caisse · [Encaisseur ▾ moi]
Période [01–30/09]
Espèces encaissées : 210 000
Déjà remis :         150 000
À remettre :          60 000
─ Détail ────────────────
12/09 · A12 · 25 000 >
…
[ Enregistrer une remise ]
  Remis [ 60 000 ]  Écart 0
```

### 11) Sortie d'un locataire · `[O][G]`

```
< Sortie · Paul Mballa · A12
Préavis : 15/09/2026
Sortie effective [ 30/09/2026 ]
─ Calcul (RG15) ─────────
Caution versée      25 000
− Impayés          −10 000
− Retenues motivées  −5 000  ✎ motif
= À rembourser       10 000
[ Clôturer + reçu de sortie PDF ]
(la chambre repasse 🟩libre le 30/09)
```

### 12) Paramètres · `[O]`

```
Paramètres
• Profil & mentions du reçu (logo) >
• Sites & délais de grâce / prorata >
• Utilisateurs & rôles >
• Modèles de messages FR/EN >
• Modèle de contrat / reçu >
• Abonnement & facturation >
• Langue [Français ▾]
```

### Écran public (hors barre) — Vérification de reçu

```
citegest.app/r/CG-2026-000123
✅ Reçu authentique
N° CG-2026-000123
Montant 10 000 FCFA · 12/09/2026
— aucune autre donnée —
```

---

## 5. Décisions & points à valider

1. **Reçu = par paiement** (chaque `payment` a un `receiptNumber`). La "quittance mensuelle
   récapitulative" (F6.7) est V2. OK ?
2. **Numéro de reçu** format `CG-AAAA-NNNNNN`, séquence continue par (compte, année) via table
   `receipt_sequence` verrouillée en transaction. Reset annuel — à confirmer (ou continu à vie ?).
3. **Statut `RESERVED`** posé manuellement au MVP (réservations réelles = V2). OK ?
4. **Exclusion RG17** : je dénormalise `unit.shared` sur `occupancy` (trigger) pour que la contrainte
   d'exclusion soit 100 % en base. Alternative : garde applicative seule. Je pars sur la contrainte base.
5. **Prorata (RG4)** : réglage par site (`prorataMode`). Calcul = loyer × jours occupés / jours du mois.
6. **Langues** : `template` porte `locale`. Le choix de langue d'envoi suit la préférence du compte,
   surchargée par site — ou globale seulement ? (je pars : globale compte au MVP.)

Prochain lot après ta validation : **Lot 2 — Socle** (Docker Compose, auth OTP, users/rôles,
multi-tenant testé, sites/chambres/locataires/garants).
