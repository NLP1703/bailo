# Pilotes et recette terrain (LM6)

Dernier lot de la M1. Objectif : mettre Bailo entre les mains de **3 cités pilotes**
qui utilisent déjà la plateforme web, dérouler la recette sur leurs **données réelles**
et sur de **vrais téléphones**, puis publier (APK direct, puis fiche Play Store).

> Référence : cahier des charges n°2 (section 9), décisions [D5, D6, D7](01-decisions.md),
> appareils et mesures de [04-appareils-de-test.md](04-appareils-de-test.md), parcours de
> démonstration de [03-ecrans-et-navigation.md](03-ecrans-et-navigation.md).

Ce lot est surtout du **terrain et de la mise en production** : l'essentiel des étapes
ci-dessous demande des comptes et des appareils (Expo/EAS, Google Play, téléphones des
gardiens) qui n'existent pas dans le dépôt. Ce document est la check-list qui les relie à
ce qui est déjà prêt côté code.

## 1. Choisir les cités pilotes (D7)

Trois cités qui **utilisent déjà le web** (le cahier l'exige) pour que la recette porte sur
des données réelles. Les prévenir et leur montrer les maquettes avant d'installer l'app.

| #   | Cité | Ville / quartier | Gérant (contact) | Nb chambres | Déjà sur le web | Téléphone(s) de test |
| --- | ---- | ---------------- | ---------------- | ----------- | --------------- | -------------------- |
| 1   | _à remplir_ | | | | oui | |
| 2   | _à remplir_ | | | | oui | |
| 3   | _à remplir_ | | | | oui | |

## 2. Prérequis avant la première installation

Hors application (plateforme) — à confirmer **actifs en production** :

| Prérequis | Pourquoi | Lot | État |
| --------- | -------- | --- | ---- |
| Redis (Upstash) branché en prod | File des notifications, relances automatiques | LM4 | _à vérifier_ |
| Stockage Cloudflare R2 actif en prod | Photos (preuves, compteurs, pannes, pièces) | LM3 | _à vérifier_ |
| `PUBLIC_RECEIPT_BASE` = site + `/r` | QR des reçus vérifiables | LM3 | _à vérifier_ |
| `PUBLIC_APP_URL` = adresse du site | Liens d'invitation corrects | LM2 | _à vérifier_ |
| Credentials FCM (clé serveur + `google-services`) | Notifications push réelles | LM4 | voir [05-notifications-push.md](05-notifications-push.md) |
| Redéploiement Railway après LM5 | Active les opérations de synchro des sorties | LM5 | _à vérifier_ |

Comptes et secrets de publication (à créer une fois) :

- **Compte Expo / EAS** (offre gratuite, D6) — `eas login`, puis `eas init` dans
  `apps/mobile` pour renseigner `extra.eas.projectId` dans `app.json`.
- **Clé de signature Android** — générée et conservée par EAS (`eas credentials`), ou un
  keystore local gardé **hors du dépôt** (déjà ignoré : `*.jks`, `*.keystore`,
  `credentials/`). La **même clé** sert à l'APK direct et au Play Store (D5), sinon les
  mises à jour ne passent pas de l'un à l'autre.
- **Compte développeur Google Play** (frais d'inscription unique) — pour la fiche et la
  piste interne. Le compte de service JSON se place dans `apps/mobile/credentials/`
  (ignoré par git) et est référencé par `eas.json` (`submit.production`).

## 3. Construire et signer l'application

Profils définis dans [`eas.json`](../eas.json) :

| Profil | Sortie | Distribution | Usage |
| ------ | ------ | ------------ | ----- |
| `development` | APK (dev client) | interne | développement, rechargement Metro |
| `preview` | **APK signé** | interne (lien d'install) | APK direct des pilotes (D5) |
| `production` | **AAB signé** | store | fiche Play Store |

`appVersionSource: "remote"` : EAS gère le `versionCode` ; `autoIncrement` l'augmente à
chaque build, donc chaque APK/AAB s'installe par-dessus le précédent.

```bash
# Une fois : rattacher le projet au compte Expo
cd apps/mobile && eas init

# APK signé pour les pilotes (téléchargeable depuis le site Bailo)
eas build --platform android --profile preview

# AAB pour le Play Store
eas build --platform android --profile production

# Envoi vers la piste interne du Play Store (brouillon)
eas submit --platform android --profile production --latest
```

Secours sans EAS (build local sur le PC, D6) :

```bash
cd apps/mobile
npx expo prebuild --platform android
cd android && ./gradlew :app:assembleRelease   # APK signé avec le keystore local
```

Mises à jour de l'interface sans repasser par le store (EAS Update, NFM13) :
`eas update:configure` puis `eas update --branch preview` (le canal est déjà fixé par
profil dans `eas.json`).

## 4. Grille de recette terrain

La recette se fait sur un **vrai téléphone** par classe d'appareil (les économiseurs de
batterie des fabricants, qui bloquent les notifications, ne se voient pas à l'émulateur).

### 4.1 Appareils (voir [04-appareils-de-test.md](04-appareils-de-test.md))

| Classe | Critères | Appareil retenu | État |
| ------ | -------- | --------------- | ---- |
| Référence | 2 Go RAM, 16 Go, Android 8–10 | _à choisir_ | |
| Courant | 3–4 Go RAM, Android 11–13 (Tecno/Infinix/itel/Samsung A) | _à choisir_ | |
| Récent | Android 14+ (règles récentes notifications/permissions) | _à choisir_ | |

### 4.2 Mesures (seuils du cahier) — sur l'appareil de référence

| Mesure | Seuil | Exigence | Mesuré |
| ------ | ----- | -------- | ------ |
| Taille de l'app installée | < 40 Mo | NFM2 | |
| Base locale, site de 100 chambres | < 50 Mo | NFM2 | |
| Ouverture à froid jusqu'à l'écran utile | < 3 s | NFM3 | |
| Gestes pour atteindre Encaisser | ≤ 2 | NFM3 | |
| Encaissement complet | < 20 s | MG3.1 | |
| Données d'une synchro courante | < 200 Ko | NFM4 | |
| Poids d'une photo envoyée | < 300 Ko | NFM4 | |
| Fonctionnement sans réseau | 7 jours | NFM6 | |
| Zones tactiles / contraste plein soleil | ≥ 48 dp | NFM11 | |

### 4.3 Parcours de démonstration (cahier 9.1)

À dérouler écran par écran, chacun sur les 3 classes d'appareil :

| Parcours | Scénario | Écrans | État |
| -------- | -------- | ------ | ---- |
| PM1 | Encaissement **sans réseau** puis synchro au retour | T7 | |
| PM2 | Contrôle à distance (propriétaire) | T13, T14 | |
| PM3 | Tournée de 30 relevés | T10 | |
| PM4 | Fuite d'eau (panne urgente + photos) | T11 | |
| PM5 | Relances du matin | T9 | |

### 4.4 Conditions réseau à simuler

Mode avion · 3G lente (limiteur de débit) · coupure en pleine synchronisation · réseau qui
revient et repart toutes les quelques secondes. Vérifier à chaque fois : aucune perte de
saisie, file d'opérations reprise, rien en double, écran « À corriger » (T16) pour les
refus serveur.

## 5. Déroulé par cité

Pour chacune des 3 cités :

1. Créer/activer les comptes gérant et gardien sur le web (déjà existants pour une cité
   pilote), vérifier les sites et chambres.
2. Installer l'APK `preview` sur le téléphone du gardien ; première connexion
   (téléphone/e-mail + mot de passe ou lien d'invitation), enregistrement de l'appareil,
   choix du PIN (D4).
3. Dérouler PM1→PM5 et les mesures, noter les anomalies (§ 6).
4. Laisser la cité l'utiliser quelques jours en conditions réelles ; relever les retours.

## 6. Journal des anomalies

| # | Cité / appareil | Parcours | Description | Gravité | État |
| - | --------------- | -------- | ----------- | ------- | ---- |
|   |                 |          |             |         |      |

## 7. Critères de sortie (go / no-go)

- Les 3 cités ont déroulé PM1→PM5 sans perte de donnée ni doublon, réseau coupé compris.
- Les seuils NFM2/3/4/6/11 sont tenus sur l'appareil de référence.
- Notifications reçues sur un appareil réel (économiseur de batterie compris) — dépend des
  credentials FCM (LM4).
- APK direct signé disponible sur le site Bailo ; fiche Play Store en piste interne avec la
  même clé de signature.
- Aucune anomalie bloquante ouverte.
