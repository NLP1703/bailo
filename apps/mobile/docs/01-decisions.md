# Décisions de cadrage (LM1)

Chaque décision a un statut : **Validée** (confirmée par le propriétaire du projet) ou
**Proposée** (recommandation retenue par défaut ; elle peut encore changer avant LM2).

## D1 — Nom de l'application : Bailo

- **Statut** : Validée (28/10/2026).
- Le cahier des charges n°2 parlait de « CitéGest ». Le produit s'appelle Bailo : site,
  domaine, référencement Google et e-mails portent ce nom. L'application aussi : nom
  affiché, fiche du Play Store, identifiant du paquet (`cm.bailo.app`, à confirmer avant
  la première publication car il ne peut plus changer ensuite).

## D2 — Périmètre : toutes les fonctionnalités du web

- **Statut** : Validée (28/10/2026).
- L'application reprend chaque écran de la plateforme web, en plus des fonctions de
  terrain du cahier. Cela élargit le cahier, qui laissait sur le web l'inscription, le
  paramétrage avancé et la comptabilité. Conséquence : un lot LM5 « Parité web » de
  4 semaines ; la M1 passe de 14 à 18 semaines.
- Inchangé : aucun accès pour les locataires et les parents.

## D3 — Base locale : expo-sqlite chiffré plutôt que WatermelonDB

- **Statut** : Proposée.
- **Choix** : expo-sqlite avec chiffrement SQLCipher, des tables simples qui reflètent
  celles de l'API, et une file d'opérations écrite pour Bailo (voir le protocole).
- **Pourquoi** : moins de configuration native et de dépendances (taille < 40 Mo, NFM2) ;
  le volume visé (un site de 100 chambres, quelques milliers de lignes) ne demande pas le
  moteur de synchronisation de WatermelonDB, dont nous n'utiliserions pas le protocole.
- **À vérifier en LM2** : le chiffrement SQLCipher avec expo-sqlite dans un build EAS
  (option de configuration du module) et son coût au démarrage (NFM3 < 3 s).

## D4 — PIN du gardien : seulement sur un téléphone déjà enregistré

- **Statut** : Proposée.
- **Choix** : la première connexion se fait avec téléphone ou e-mail + mot de passe (ou
  par le lien d'invitation). Le téléphone est alors enregistré (`device`) et l'utilisateur
  choisit un PIN à 4 chiffres. Ensuite, le PIN ou la biométrie déverrouille l'application
  sur **ce** téléphone uniquement.
- **Pourquoi** : un PIN à 4 chiffres utilisé seul comme identifiant se devine en
  10 000 essais au plus. Lié à un appareil enregistré et limité en essais (5 erreurs →
  retour au mot de passe), il reste simple pour le gardien sans être devinable à distance.
- Le cahier (section 2) prévoyait « téléphone + PIN » pour le gardien : l'usage quotidien
  est identique, seule la toute première connexion demande le mot de passe.

## D5 — Publication : APK direct d'abord, Play Store aux pilotes

- **Statut** : Proposée.
- APK signé téléchargeable depuis le site Bailo pendant le développement et les premiers
  tests (gratuit). Fiche Play Store ouverte pour les pilotes (LM6) : le compte développeur
  Google est payant (frais d'inscription unique, montant à vérifier à l'inscription).
- La même clé de signature sert pour l'APK direct et le Play Store, pour que les mises à
  jour passent de l'un à l'autre.

## D6 — Builds : offre gratuite EAS, build local en secours

- **Statut** : Proposée.
- Builds Android dans le cloud avec l'offre gratuite d'Expo (EAS), qui limite le nombre de
  builds par mois (limite à vérifier au lancement). En secours : build Android local
  (`expo prebuild` + Gradle) sur le PC.
- Mises à jour de l'interface sans passer par le store avec EAS Update (NFM13).

## D7 — Cités pilotes

- **Statut** : À faire.
- Le cahier exige 3 cités qui utilisent déjà le web avant la M1 ; la recette (LM6) se fait
  sur leurs données réelles. Les identifier pendant LM1 pour leur montrer les maquettes.

## Prérequis côté plateforme (hors application)

| Prérequis                                      | Pourquoi                                               | Lot qui en a besoin |
| ---------------------------------------------- | ------------------------------------------------------ | ------------------- |
| Redis (Upstash, gratuit) branché en production | File d'envoi des notifications, relances automatiques  | LM4                 |
| Stockage Cloudflare R2 actif en production     | Photos : preuves, compteurs, pannes, pièces d'identité | LM3                 |
| `PUBLIC_RECEIPT_BASE` = adresse du site + `/r` | QR des reçus vérifiables                               | LM3                 |
| `PUBLIC_APP_URL` = adresse du site             | Liens d'invitation corrects                            | LM2                 |
