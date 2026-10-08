# CitéGest — Lot 6 · Front MVP complet

Finalisation des écrans front qui restaient en stub après le Lot 5. L'API et les schémas
partagés existaient déjà ; ce lot est **exclusivement côté `apps/web`** (un seul ajout backend
mineur : la fiche locataire renvoie désormais ses occupations).

## Écrans ajoutés (tous fonctionnels, reliés à l'API)

| Écran               | Route                    | Contenu                                                                                                                    |
| ------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| **Plus** (menu)     | `/more`                  | Accès aux écrans secondaires selon le rôle                                                                                 |
| **Locataires**      | `/tenants`               | Recherche (nom/téléphone), lien vers la fiche                                                                              |
| **Fiche locataire** | `/tenants/:id`           | Coordonnées, garants (payeur principal), occupations → Encaisser / Sortie                                                  |
| **Nouvelle entrée** | `/new-entry`             | Assistant **3 étapes** : chambre libre → locataire → conditions & avance, aperçu du total, création + paiement d'ouverture |
| **Dépenses**        | `/expenses`              | Saisie rapide (site, catégorie, montant, date) + liste                                                                     |
| **Caisse**          | `/cash`                  | Journal par encaisseur (gardien = la sienne), totaux attendu/remis/à remettre, **remise**                                  |
| **Sortie**          | `/checkout?occupancyId=` | Date de sortie + retenues motivées → clôture (RG15), affiche à rembourser / reste dû                                       |
| **Paramètres**      | `/settings`              | Profil, langue FR/EN, **sites** (création + chambres en série), **utilisateurs** (invitation, activation/désactivation)    |

La barre du bas garde 5 onglets (Accueil · Chambres · Encaisser · Relances · Plus) ;
les écrans secondaires sont regroupés sous **Plus**, filtrés par rôle (le gardien ne voit
que Caisse). La **vérification publique de reçu** (`/r/:id`) reste hors authentification.

## Parcours couverts (cahier des charges §8.1)

- **P1** (mise en service) : Paramètres → créer un site → chambres en série → Nouvelle entrée / import.
- **P2** (entrée avec avance) : Nouvelle entrée en 3 étapes, aperçu « caution + N loyers », création + reçu.
- **P3** (encaissement, même hors-ligne) : Encaisser, mise en file et synchro automatique.
- **P4** (relances du matin) : Relances du jour → WhatsApp → marquer envoyée.

## Vérifications (dans cet environnement)

- `pnpm lint` ✅ · `pnpm format:check` ✅
- typecheck **web** + **api** ✅ · tests unitaires inchangés (**48** verts) ✅
- `vite build` ✅ (bundle ~**130 Ko gzip**, service worker généré)

## Reste (hors MVP)

Édition fine des modèles de messages/contrat/reçu depuis Paramètres (API `GET/PUT /templates`
déjà disponible), upload de photos/pièces (liens signés S3 — API prête), et les fonctionnalités
V2 (paiement en ligne, sous-compteurs, réservations, incidents, relances automatiques).
