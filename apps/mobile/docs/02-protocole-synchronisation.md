# Protocole de synchronisation hors-ligne

Ce document est le livrable central de LM1 : il fixe comment l'application enregistre des
opérations sans réseau et comment le serveur les applique **une seule fois**, dans le bon
ordre, sans jamais en perdre. Le moteur (LM2) et les routes d'API sont construits à partir
de lui ; il est testé avant toute fonction métier.

Règles couvertes : RGM1 à RGM12 du cahier n°2. Le serveur reste la seule source de vérité
pour les soldes (RG1 à RG22 du cahier n°1).

---

## 1. Principes

1. **On envoie des intentions, pas des états.** Le téléphone n'écrit jamais « le solde vaut
   X » ; il envoie « encaisser 15 000 FCFA sur l'occupation O ». Le serveur applique ses
   règles et renvoie le résultat.
2. **Chaque opération a un identifiant unique créé sur le téléphone** (`opId`, UUID v4).
   Le serveur garde la trace de chaque `opId` reçu : une opération renvoyée deux fois n'est
   appliquée qu'une fois (RGM1). L'envoi est « au moins une fois », l'effet est « une seule
   fois ».
3. **L'ordre de saisie est respecté** par téléphone (RGM2) : un numéro de séquence croissant
   (`seq`) accompagne chaque opération ; le serveur les traite dans cet ordre.
4. **Rien ne se perd en silence** : une opération refusée par le serveur passe dans la liste
   « à corriger », visible par son auteur et par le propriétaire (RGM6).
5. **Les créations n'ont jamais de conflit** (RGM8) ; seules les modifications de fiche en
   ont, et la dernière reçue l'emporte, l'ancienne valeur restant au journal d'audit (RGM9).

## 2. Ce que le téléphone garde en local

Base SQLite chiffrée (décision D3), une par compte connecté, effacée à la déconnexion de
l'appareil (RGM12).

| Table locale                           | Contenu                                                          | Fenêtre gardée                                       |
| -------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------- |
| `sites`, `blocks`, `units`             | Sites accessibles à l'utilisateur, blocs, chambres               | Tout                                                 |
| `tenants`, `guarantors`, `occupancies` | Locataires, garants, occupations en cours                        | Occupations en cours + sorties des 90 derniers jours |
| `charges`                              | Échéances                                                        | Non soldées + 90 derniers jours                      |
| `payments`, `allocations`              | Paiements et affectations                                        | 90 derniers jours                                    |
| `meters`, `meter_readings`             | Compteurs et relevés                                             | 2 derniers relevés par compteur (contrôle RG19)      |
| `tickets`                              | Pannes                                                           | Ouvertes + résolues des 30 derniers jours            |
| `expenses`                             | Dépenses                                                         | Mois en cours et précédent                           |
| `reminders`                            | Relances                                                         | Du jour + historique 30 jours                        |
| `templates`                            | Modèles de messages                                              | Tout                                                 |
| `outbox`                               | Opérations en attente d'envoi                                    | Jusqu'à confirmation du serveur                      |
| `to_fix`                               | Opérations refusées (« à corriger »)                             | Jusqu'à traitement par l'utilisateur                 |
| `uploads`                              | Photos en attente d'envoi                                        | Jusqu'à envoi                                        |
| `meta`                                 | `deviceId`, curseur de pull, dernière synchro, version du schéma | —                                                    |

Les fenêtres sont des propositions à valider avec la mesure de NFM2 (base < 50 Mo pour
100 chambres) au début de LM2.

## 3. Format d'une opération

```ts
interface SyncOperation {
  opId: string; // UUID v4 créé sur le téléphone — clé d'idempotence (RGM1)
  seq: number; // ordre de saisie sur ce téléphone, strictement croissant (RGM2)
  type: OperationType; // voir § 4
  v: number; // version du format de cette opération (NFM14)
  siteId: string; // site concerné (contrôle d'accès côté serveur)
  createdAt: string; // horloge du téléphone, ISO 8601 — affichage et contrôles
  payload: unknown; // validé côté serveur par le schéma Zod du type (packages/shared)
  base?: { updatedAt: string }; // modifications seulement : version lue sur le téléphone (RGM9)
}
```

**Identifiants des nouvelles entités.** Une entité créée hors-ligne (paiement, panne,
dépense, locataire, occupation, relevé) reçoit son UUID **sur le téléphone**, et le serveur
l'accepte comme clé primaire après contrôle (format, compte, unicité). Les opérations
suivantes peuvent donc la référencer tout de suite (par exemple : créer un locataire, puis
son occupation, puis le premier paiement), sans table de correspondance à gérer.
Pour les paiements, `opId` reste égal au `clientId` déjà utilisé par le web : la route
actuelle et sa garantie anti-doublon sont conservées.

## 4. Types d'opérations

### Saisissables hors-ligne (mises en file)

| Type                  | Effet                                                                                             | Exigences          |
| --------------------- | ------------------------------------------------------------------------------------------------- | ------------------ |
| `payment.create`      | Encaissement (affectation calculée par le serveur)                                                | MG3.1, MG3.2, RGM3 |
| `attachment.link`     | Rattache une photo envoyée (preuve, compteur, panne, justificatif, pièce d'identité) à son entité | MG3.3, MX3         |
| `meterReading.create` | Relevé d'index                                                                                    | MG5.1, MG5.2       |
| `ticket.create`       | Signalement de panne                                                                              | MG5.3              |
| `expense.create`      | Dépense                                                                                           | MG5.5              |
| `cashHandover.create` | Déclaration de remise de caisse                                                                   | MG3.6              |
| `reminder.markSent`   | Relance marquée envoyée (après ouverture de WhatsApp ou SMS)                                      | MG4.1, MG4.4       |
| `tenant.update`       | Modification d'une fiche locataire (téléphone, garant…)                                           | RGM9               |
| `occupancy.create`    | Nouvelle entrée (locataire + occupation + paiement d'ouverture éventuel)                          | MG2.3              |
| `ticket.updateStatus` | Statut d'une panne (M2)                                                                           | MG5.4              |

### En ligne uniquement (jamais mises en file)

Ces actions demandent une décision sur l'état exact du serveur ou touchent la sécurité ;
sans réseau, le bouton est grisé avec « Nécessite une connexion ».

Annulation d'un paiement (MG3.7), confirmation ou contestation d'une remise de caisse
(MP2.1), remise ou délai sur une échéance (MP3.2), changement de loyer (MP3.3), clôture de
sortie (RG15), signature de contrat, invitations et gestion de l'équipe, gestion des
appareils, paramètres du compte et des sites, abonnement.

## 5. Envoi : `POST /sync/push`

### Requête

```http
POST /api/v1/sync/push
X-Bailo-Client: native
X-Bailo-App-Version: 1.0.0
Authorization: Bearer <jeton d'accès>

{ "deviceId": "…", "pendingCount": 12, "oldestPendingAt": "2026-…", "ops": [ …au plus 50, triées par seq… ] }
```

### Traitement serveur

Pour chaque opération, **dans l'ordre de `seq`**, chacune dans sa propre transaction :

1. Si `opId` existe déjà dans `sync_operation` : renvoyer le résultat enregistré
   (`duplicate`) sans rien réappliquer.
2. Valider le `payload` avec le schéma Zod du type et la version `v`.
3. Vérifier les droits (rôle, site, abonnement non en lecture seule) au moment du traitement.
4. Appliquer la règle métier (le service existant : paiements, relevés, pannes…).
5. Enregistrer `sync_operation` (`opId` unique, `deviceId`, `userId`, `type`, `status`,
   `errorCode`, `entityId`, `receivedAt`) **dans la même transaction** que l'effet métier :
   impossible d'avoir l'effet sans la trace, ou l'inverse.

### Réponse : un résultat par opération

| `status`    | Sens                                                        | Ce que fait le téléphone                                             |
| ----------- | ----------------------------------------------------------- | -------------------------------------------------------------------- |
| `applied`   | Appliquée                                                   | Retire de `outbox`, met à jour la base locale avec `entity` renvoyée |
| `duplicate` | Déjà appliquée (renvoi)                                     | Comme `applied`                                                      |
| `rejected`  | Refusée par une règle métier (`errorCode`, message lisible) | Déplace dans `to_fix` (RGM6) ; continue avec la suivante             |
| `retry`     | Erreur passagère côté serveur                               | Garde en file ; arrête l'envoi du lot pour préserver l'ordre         |

**Dépendances** : si une opération est refusée, celles du même lot qui référencent l'entité
qu'elle devait créer sont refusées avec `DEPENDENCY_REJECTED` (par exemple, le paiement
d'ouverture d'une nouvelle entrée refusée). Elles vont ensemble dans « à corriger ».

**Coupure pendant l'envoi** (critère de recette n°1) : si la réponse n'arrive pas, le
téléphone renvoie le même lot ; les opérations déjà appliquées reviennent en `duplicate`.
Aucun doublon, aucune perte.

### Motifs de refus prévus (`errorCode`)

Chambre déjà occupée, occupation clôturée, locataire sorti, montant invalide, index
inférieur au précédent (RG19 ; normalement bloqué avant sur le téléphone), date de paiement
hors limites (§ 9), droits retirés ou site retiré à l'utilisateur, compte en lecture seule,
version d'opération non prise en charge, dépendance refusée.

### Quand envoyer (RGM2)

- Dès qu'une opération est ajoutée et que le réseau est disponible.
- Au retour du réseau, à l'ouverture de l'application et après le déverrouillage.
- En cas d'échec réseau ou de `retry` : nouvelle tentative avec attente croissante
  (5 s, 15 s, 1 min, puis toutes les 5 min tant que l'app est ouverte).
- Pas de travail en arrière-plan en dehors de ces moments (NFM5).

## 6. Photos et pièces jointes

Les photos ne bloquent jamais une opération d'argent.

1. Prise de vue, puis compression sur le téléphone : 1280 px au plus sur le grand côté,
   JPEG, qualité réglée pour rester sous 300 Ko (NFM4). Le fichier est rangé dans le
   stockage privé de l'app et une ligne est ajoutée dans `uploads`.
2. L'opération métier part tout de suite (elle n'attend pas la photo).
3. Envoi de la photo : URL d'envoi signée (`POST /files/upload-url`, route existante), puis
   dépôt direct sur Cloudflare R2 ; en mode économie de données, uniquement en Wi-Fi (MX10).
4. Une fois la photo déposée, une opération `attachment.link` la rattache à son entité.
5. Les pièces d'identité ne sont jamais enregistrées dans la galerie du téléphone et leurs
   écrans bloquent les captures (NFM9).

## 7. Réception : `GET /sync/pull`

```http
GET /api/v1/sync/pull?siteId=<site>&cursor=<curseur opaque>
```

Réponse : les lignes modifiées depuis le curseur, par table, les suppressions
(`tombstones`), un nouveau curseur, et `hasMore` (pages de 500 lignes au plus, pour tenir
les 200 Ko d'une synchro courante, NFM4).

Évolutions par rapport à la route actuelle :

| Point         | Aujourd'hui                                                                    | Proposé                                                                                                                                                                        |
| ------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Filtre        | Tout le compte                                                                 | Par site, et seulement les sites accessibles à l'utilisateur                                                                                                                   |
| Volume        | Toutes les lignes, sans limite                                                 | Fenêtres du § 2, pagination                                                                                                                                                    |
| Suppressions  | Non transmises                                                                 | Table `sync_tombstone` alimentée par les suppressions définitives (remise à zéro d'un compte, utilisateur supprimé) ; une remise à zéro complète renvoie `resetRequired: true` |
| Curseur       | `serverTime` exact                                                             | `serverTime` moins une marge de 2 min : une transaction validée juste après la lecture n'est pas perdue ; les lignes reçues deux fois sont simplement réécrites                |
| Autres tables | Sites, blocs, chambres, locataires, garants, occupations, échéances, paiements | + compteurs, relevés, pannes, dépenses, relances, modèles                                                                                                                      |

**Quand recevoir (RGM5)** : à chaque ouverture avec réseau, après chaque envoi réussi, puis
toutes les 15 min tant que l'application est au premier plan.

## 8. Affichage pendant l'attente (RGM3, RGM4)

- Un paiement en file est affiché « en attente de synchronisation ». Le solde affiché sur
  la fiche est le solde serveur **moins** les paiements en attente, avec la mention
  « provisoire ».
- L'aperçu d'affectation hors-ligne utilise le même algorithme que le serveur (les plus
  anciennes échéances d'abord), placé dans `packages/shared` pour être identique ; le
  serveur recalcule et fait foi.
- **Reçu provisoire** : PDF généré sur le téléphone, numéro local
  `PROV-<4 caractères de l'appareil>-<seq>`, mention « PROVISOIRE » bien visible ; partage
  possible par WhatsApp hors-ligne.
- **Reçu définitif** : après synchronisation, le serveur attribue le numéro officiel (RG9)
  et produit le PDF. L'envoi au locataire demande un geste (WhatsApp ou SMS s'ouvrent depuis
  le téléphone) : l'application affiche la liste « Reçus définitifs à envoyer » et une
  notification locale.

## 9. Horloge du téléphone

L'horloge d'un téléphone peut être fausse. Le serveur garde l'heure de réception
(`receivedAt`) et contrôle la date saisie (`paidAt`, date du relevé) : pas plus de 5 min
dans le futur, pas plus de 7 jours dans le passé (NFM6). En dehors : refus vers « à corriger »,
où l'auteur corrige la date.

## 10. Modifications de fiche (RGM9)

`tenant.update` (et `ticket.updateStatus` en M2) porte `base.updatedAt`, la version lue sur
le téléphone. Le serveur applique toujours la dernière modification reçue et écrit
l'ancienne valeur au journal d'audit (RG21). Si la fiche avait changé depuis la version lue,
le résultat porte `overwritten: true` pour que l'auteur voie qu'il a remplacé une
modification plus récente.

## 11. Appareils, sessions et déconnexion (RGM10 à RGM12)

- À chaque connexion par mot de passe, le téléphone s'enregistre (`POST /auth/device`) avec
  son identifiant (créé une fois, gardé dans le trousseau). Deux appareils actifs au plus par
  utilisateur : au-delà, l'API répond `409 DEVICE_LIMIT_REACHED` avec la liste, l'utilisateur
  choisit lequel déconnecter et l'app renvoie la demande avec `replaceDeviceId`.
- Chaque requête porte `X-Bailo-Device`. Un téléphone inconnu du serveur reçoit
  `409 SYNC_DEVICE_UNKNOWN` et se réenregistre automatiquement.
- **Déconnexion à distance** (`DELETE /auth/devices/:id`, propriétaire ou l'utilisateur
  lui-même, tracée dans le journal) : l'appareil est marqué révoqué. À son envoi suivant,
  le serveur accepte les opérations créées **avant** la révocation, refuse les autres
  (`SYNC_DEVICE_REVOKED`) et répond `deviceRevoked: true` ; la réception lui est refusée
  (`403 SYNC_DEVICE_REVOKED`). L'app envoie alors ce qu'elle a, efface sa base locale et
  revient à l'écran de connexion (RGM12). Un téléphone volé qui ne se reconnecte jamais ne
  peut rien lire : base chiffrée, clé dans le Keystore, PIN.
- Limite connue : les jetons de session ne sont pas liés à l'appareil ; la révocation prend
  effet à la synchronisation suivante, pas à la seconde.
- **Alerte à 48 h (RGM7)** : chaque envoi et chaque réception transmettent `pendingCount` et
  `oldestPendingAt`. Une tâche serveur alerte le propriétaire si un appareil a signalé des
  opérations en attente depuis plus de 48 h, ou n'a plus donné de nouvelles depuis 48 h alors
  qu'il en avait.

## 12. Versions de l'application (NFM13, NFM14)

Chaque requête porte `X-Bailo-App-Version` ; chaque opération porte `v`. L'API accepte les
deux dernières versions de l'application. Une version plus ancienne reçoit `426` avec
l'adresse de mise à jour : l'application envoie d'abord sa file si le format est encore
lisible, puis demande la mise à jour.

## 13. Ajouts à l'API qui découlent de ce protocole

| Ajout                  | Détail                                                                                                                                    |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Table `sync_operation` | `opId` (unique), `deviceId`, `userId`, `accountId`, `type`, `v`, `status`, `errorCode`, `entityId`, `createdAt` (téléphone), `receivedAt` |
| Table `device`         | `userId`, plateforme, version de l'app, jeton push, `lastSeenAt`, `pendingCount`, `oldestPendingAt`, `revokedAt`                          |
| Table `sync_tombstone` | `accountId`, `table`, `entityId`, `deletedAt`                                                                                             |
| `POST /sync/push`      | Multi-types, ordonné, résultats par opération, tracé dans `sync_operation` ; reste compatible avec l'envoi actuel du web (`payments`)     |
| `GET /sync/pull`       | Par site, curseur avec marge, pagination, suppressions, nouvelles tables                                                                  |
| Services métier        | Acceptent un identifiant fourni par le client pour les créations                                                                          |
| Partagé                | Schémas Zod des opérations et algorithme d'affectation dans `packages/shared`                                                             |

## 14. Tests (avant toute fonction métier)

**Serveur, tests e2e automatisés :**

- Même lot envoyé deux fois → effets appliqués une seule fois, résultats `duplicate`.
- Lot traité à moitié puis réponse perdue → renvoi complet sans doublon.
- Opération refusée au milieu d'un lot → les suivantes indépendantes passent, les
  dépendantes sont refusées avec `DEPENDENCY_REJECTED`.
- Droits retirés entre la saisie et l'envoi → refus propre, rien d'appliqué.
- Pull avec écriture concurrente pendant la lecture → la ligne arrive au pull suivant.

**Téléphone, tests du moteur avec réseau simulé :**

- Coupures aléatoires pendant l'envoi sur 1 000 opérations → serveur et téléphone d'accord
  à la fin, aucun doublon.
- Application tuée en pleine écriture locale → file intacte au redémarrage.

**Recette (appareil de référence, mode avion) :** 20 paiements saisis hors-ligne puis
synchronisés, avec coupure en pleine synchronisation → 20 paiements au serveur, aucun
doublon (critère n°1 du cahier).

## 15. État de l'implémentation (LM2)

Fait et couvert par `apps/api/test/sync-mobile.e2e.spec.ts` (17 tests) :

- `POST /sync/push` multi-types (`payment`, `meterReading`, `ticket`, `expense`,
  `cashHandover`), traité dans l'ordre de `seq`, tracé dans `sync_operation` ; renvoi =
  `duplicate` sans rien réappliquer ; opération restée « en cours » plus de 2 min →
  `SYNC_NEEDS_REVIEW` ; refus : type inconnu, contenu invalide, rôle, site retiré, site
  incohérent, date hors limites, compte en lecture seule, index de compteur en baisse (RG19).
- `GET /sync/pull?siteId&cursor&limit` : instantané par site, pagination par
  (horodatage, id) sans doublon ni trou, curseur final avec marge de 2 min, suppressions,
  remise à zéro (`resetRequired`). L'ancien format du site web reste accepté.
- Appareils : enregistrement, limite de 2, remplacement, liste, déconnexion à distance.
- Contrôles d'accès au site ajoutés aux relevés, pannes et dépenses (aussi par le web).

Reste pour plus tard : refus en cascade `DEPENDENCY_REJECTED` (aucune opération actuelle ne
dépend d'une autre), alerte serveur à 48 h (LM4), réponse `426` aux vieilles versions (avant
la publication), photos (§ 6, LM3).
