# Bailo mobile

Application mobile de Bailo pour les bailleurs et leurs équipes (propriétaire, gérant,
gardien). Android d'abord, iOS ensuite. Elle reprend toutes les fonctionnalités de la
plateforme web (`apps/web`) et ajoute les fonctions de terrain : travail hors-ligne,
appareil photo, notifications, lecture de QR.

Les locataires et leurs parents n'ont **aucun** accès à l'application : ils reçoivent
seulement les reçus et rappels envoyés par WhatsApp, SMS ou e-mail.

> Référence : cahier des charges n°2 (v1.0, 30/09/2026) et plan d'action « Application
> mobile Bailo ». Ce dossier suit le plan lot par lot.

## Où en est-on

| Lot                           | Contenu                                                                        | État                         |
| ----------------------------- | ------------------------------------------------------------------------------ | ---------------------------- |
| LM1 Cadrage (sem. 1–2)        | Décisions, protocole de synchronisation, écrans, appareils de test, maquettes  | Livré (retours attendus)     |
| LM2 Socle mobile (sem. 3–5)   | Projet Expo, connexion, PIN, base locale chiffrée, moteur de synchronisation   | Livré (API + app)            |
| LM3 Gestionnaire (sem. 6–9)   | Chambres, encaissement hors-ligne, caisse, relevés, pannes, dépenses, relances | **En cours** (voir plus bas) |
| LM4 Propriétaire (sem. 10–12) | Vue multi-sites, contrôle de l'équipe, remises de caisse, notifications        | À venir                      |
| LM5 Parité web (sem. 13–16)   | Inscription, sites, contrats, sorties, comptabilité, administration            | À venir                      |
| LM6 Pilotes (sem. 17–18)      | Test sur 3 cités, recette, APK et Play Store                                   | À venir                      |

## Documents de cadrage (LM1)

1. [Décisions](docs/01-decisions.md) — nom, base locale, PIN, publication, builds, pilotes
2. [Protocole de synchronisation](docs/02-protocole-synchronisation.md) — le cœur du hors-ligne
3. [Écrans et navigation](docs/03-ecrans-et-navigation.md) — la liste qui sert de base aux maquettes
4. [Appareils de test](docs/04-appareils-de-test.md) — l'appareil de référence et la grille de tests

## Pile technique retenue

React Native + Expo (builds EAS), TypeScript, React Navigation, expo-sqlite chiffré
(SQLCipher), TanStack Query pour les écrans en ligne, Expo Notifications (Firebase Cloud
Messaging), expo-camera, expo-image-manipulator, expo-local-authentication,
expo-secure-store, Sentry. Les schémas Zod et les types viennent de `packages/shared`,
comme pour le web, et l'application parle à la même API NestJS (`apps/api`).

La navigation utilise Expo Router (bâti sur React Navigation, recommandé par Expo SDK 58).

## Lancer l'application (développement)

L'app utilise SQLCipher (base chiffrée), absent d'Expo Go : il faut une **version de
développement** compilée, sur l'émulateur Android ou un téléphone branché en USB.

Prérequis (une fois) : Android Studio, puis dans le SDK : `platform-tools`, `emulator`,
`platforms;android-37.0`, `build-tools;37.0.0`, `ndk;27.1.12297006`, `cmake;3.31.6` et
une image système (`system-images;android-36;google_apis;x86_64`). Variables
`ANDROID_HOME` (le SDK) et `JAVA_HOME` (le Java d'Android Studio, dossier `jbr`).

```bash
pnpm install
pnpm --filter @bailo/mobile android   # compile, installe sur l'émulateur, lance Metro
```

La première compilation prend 10 à 20 minutes ; ensuite, une modification du code se
recharge en direct. Par défaut l'app parle à l'API en ligne ; pour l'API locale lancée
sur le PC : `EXPO_PUBLIC_API_URL=http://10.0.2.2:3000/api/v1` (adresse du PC vue depuis
l'émulateur) ou `http://<IP du PC>:3000/api/v1` depuis un vrai téléphone.

### Particularités Windows

Les chemins de la compilation native dépassent vite la limite de 260 caractères :

1. À la racine du dépôt, un fichier `.npmrc` contenant `virtual-store-dir-max-length=40`
   (noms courts dans `node_modules/.pnpm`), puis `pnpm install`.
2. Dans `apps/mobile/android/local.properties` (créé par la première compilation) :
   `cmake.dir=C:\\Users\\<vous>\\AppData\\Local\\Android\\Sdk\\cmake\\3.31.6`.
   Le ninja de CMake 3.22.1 (celui par défaut) ne gère pas les chemins longs.
3. Les chemins longs doivent être autorisés dans Windows (`LongPathsEnabled`).

En développement, si la base n'est pas chiffrée (Expo Go), c'est signalé dans la
console ; une version de production sans chiffrement refuse de démarrer.

## LM3 : état

Tous les écrans ci-dessous ont été déroulés sur l'émulateur avec l'API locale et les
comptes de démo, y compris sans réseau (T7) et avec un refus réel du serveur (T16).

| Écran                  | État                                                                           |
| ---------------------- | ------------------------------------------------------------------------------ |
| T2 Accueil du gérant   | Testé                                                                          |
| T3 Plan des chambres   | Testé (couleurs RG18, filtres bloc et statut, recherche)                       |
| T4 Fiche chambre       | Testé                                                                          |
| T5 Fiche locataire     | Testé                                                                          |
| T7 Encaisser           | Testé (affectation RG5, reçu provisoire WhatsApp) ; photo de la preuve (§ 6)   |
| T8 Ma caisse           | Testé (remise déclarée, à confirmer par le propriétaire en LM4)                |
| T9 Relances du jour    | Testé (message ouvert dans WhatsApp ou SMS, marque annulable)                  |
| T10 Tournée de relevés | Testé (contrôle RG19) ; photo du compteur (§ 6)                                |
| T11 Pannes             | Testé ; photos (jusqu'à 3, § 6)                                                 |
| T12 Nouvelle dépense   | Testé ; photo du justificatif (§ 6)                                            |
| T16 À corriger         | Testé (refaire ou abandonner)                                                  |
| T6 Nouvelle entrée     | **À faire** : création d'occupation hors-ligne et photo de la pièce d'identité |

L'envoi des photos (§ 6 du protocole) est intégré : prise à l'appareil sur
l'encaissement (preuve), les relevés (compteur), les pannes (jusqu'à 3) et les
dépenses (justificatif), compression (≤ 1280 px, ≤ 300 Ko), file d'envoi locale
séparée avec reprise, puis rattachement côté serveur (`attachment.link`) une fois la
saisie appliquée ; « Plus » affiche le nombre de photos encore à envoyer. Reste à
exercer une vraie capture sur l'émulateur (le store de fichiers local n'est joignable
que depuis le PC), puis la recette des parcours PM1 à PM5 sur un vrai téléphone
d'entrée de gamme.

## Organisation du code

| Dossier                | Rôle                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------ |
| `src/app/`             | Écrans (Expo Router) : connexion, PIN, déverrouillage, onglets par profil                        |
| `src/lib/`             | Configuration, client API (jetons, renouvellement), trousseau, PIN, session                      |
| `src/db/`              | Base SQLite chiffrée, file d'opérations et données reçues                                        |
| `src/sync/`            | Branchement du moteur `@bailo/sync` : réseau, déclencheurs, état                                 |
| `src/ui/`              | Thème, composants, clavier PIN                                                                   |
| `../../packages/sync/` | Moteur de synchronisation, indépendant de React Native, testé (`pnpm --filter @bailo/sync test`) |
