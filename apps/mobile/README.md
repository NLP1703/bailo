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

| Lot                           | Contenu                                                                        | État                     |
| ----------------------------- | ------------------------------------------------------------------------------ | ------------------------ |
| LM1 Cadrage (sem. 1–2)        | Décisions, protocole de synchronisation, écrans, appareils de test, maquettes  | Livré (retours attendus) |
| LM2 Socle mobile (sem. 3–5)   | Projet Expo, connexion, PIN, base locale chiffrée, moteur de synchronisation   | **En cours**             |
| LM3 Gestionnaire (sem. 6–9)   | Chambres, encaissement hors-ligne, caisse, relevés, pannes, dépenses, relances | À venir                  |
| LM4 Propriétaire (sem. 10–12) | Vue multi-sites, contrôle de l'équipe, remises de caisse, notifications        | À venir                  |
| LM5 Parité web (sem. 13–16)   | Inscription, sites, contrats, sorties, comptabilité, administration            | À venir                  |
| LM6 Pilotes (sem. 17–18)      | Test sur 3 cités, recette, APK et Play Store                                   | À venir                  |

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

Depuis la racine du dépôt :

```bash
pnpm install
pnpm --filter @bailo/mobile start
```

Scannez le QR code avec l'application **Expo Go** sur un téléphone Android (même réseau
Wi-Fi que le PC). Par défaut l'app parle à l'API en ligne
(`https://bailo-web-production.up.railway.app/api/v1`) ; pour une API locale :
`EXPO_PUBLIC_API_URL=http://<IP du PC>:3000/api/v1`.

Dans Expo Go, la base locale n'est **pas** chiffrée (SQLCipher n'y existe pas) : c'est
signalé dans la console et réservé au développement. Les versions installables (EAS) la
chiffrent ; une version de production sans chiffrement refuse de démarrer.

## Organisation du code

| Dossier                | Rôle                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------ |
| `src/app/`             | Écrans (Expo Router) : connexion, PIN, déverrouillage, onglets par profil                        |
| `src/lib/`             | Configuration, client API (jetons, renouvellement), trousseau, PIN, session                      |
| `src/db/`              | Base SQLite chiffrée, file d'opérations et données reçues                                        |
| `src/sync/`            | Branchement du moteur `@bailo/sync` : réseau, déclencheurs, état                                 |
| `src/ui/`              | Thème, composants, clavier PIN                                                                   |
| `../../packages/sync/` | Moteur de synchronisation, indépendant de React Native, testé (`pnpm --filter @bailo/sync test`) |
