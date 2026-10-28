# Écrans et navigation

Liste de référence pour les maquettes (LM1) : chaque écran, qui le voit, s'il marche sans
réseau, et le lot qui le livre. 16 écrans de terrain (cœur de la M1) + 15 écrans de parité
avec le web, ouverts depuis l'onglet « Plus ».

Droits : la matrice 2.1 du cahier n°1 s'applique telle quelle (le gardien ne voit ni la vue
d'ensemble financière ni l'activité de l'équipe).

## Barres d'onglets

| Profil       | Onglets (de gauche à droite)                         | Bouton principal                       |
| ------------ | ---------------------------------------------------- | -------------------------------------- |
| Propriétaire | Vue d'ensemble · Chambres · Équipe · Alertes · Plus  | Remises de caisse à confirmer (badge)  |
| Gérant       | Accueil · Chambres · **Encaisser** · Relances · Plus | Encaisser, au centre, toujours visible |
| Gardien      | Chambres · **Encaisser** · Compteurs · Pannes        | Encaisser                              |

Le gardien n'a pas d'onglet « Plus » : son profil, la langue et la déconnexion sont dans un
menu en haut de l'écran Chambres (4 onglets, gros boutons : risque « gardiens peu à l'aise »).

## Écrans de terrain (M1)

Légende hors-ligne : **Oui** = consultable et saisissable sans réseau ; **Lecture** =
consultable seulement ; **Non** = nécessite le réseau.

| N°  | Écran                                                                                                  | Propriétaire | Gérant | Gardien | Hors-ligne         | Lot      |
| --- | ------------------------------------------------------------------------------------------------------ | ------------ | ------ | ------- | ------------------ | -------- |
| T1  | Connexion, choix du PIN, déverrouillage (PIN, biométrie)                                               | ✓            | ✓      | ✓       | Déverrouillage oui | LM2      |
| T2  | Accueil : encaissé du jour et du mois, reste à encaisser, impayés, occupation ; choix du site          | —            | ✓      | —       | Lecture            | LM3      |
| T3  | Plan des chambres en grille colorée (RG18), filtres bloc et statut                                     | ✓            | ✓      | ✓       | Lecture            | LM3      |
| T4  | Fiche chambre : occupant, solde, mois couverts, derniers paiements, bouton Encaisser                   | ✓            | ✓      | ✓       | Lecture            | LM3      |
| T5  | Recherche et fiche locataire : coordonnées, garants, solde, historique, appel et WhatsApp              | ✓            | ✓      | —       | Lecture            | LM3      |
| T6  | Nouvelle entrée en 3 étapes avec photo de la pièce d'identité (captures bloquées)                      | ✓            | ✓      | —       | Oui                | LM3      |
| T7  | Encaisser : chambre (saisie ou scan), montant, mode, aperçu de l'affectation, photo de preuve, reçu    | ✓            | ✓      | ✓       | Oui                | LM3      |
| T8  | Ma caisse : espèces non remises, détail ; déclarer une remise                                          | —            | ✓      | ✓       | Oui                | LM3      |
| T9  | Relances du jour : rappels et retards, WhatsApp ou SMS pré-rempli, historique                          | ✓            | ✓      | —       | Oui                | LM3      |
| T10 | Tournée de relevés : liste des compteurs, index + photo, contrôle RG19, résumé                         | —            | ✓      | ✓       | Oui                | LM3      |
| T11 | Pannes : liste, signalement avec photos, urgence, chambre                                              | ✓            | ✓      | ✓       | Oui                | LM3      |
| T12 | Nouvelle dépense avec photo du justificatif                                                            | ✓            | ✓      | —       | Oui                | LM3      |
| T13 | Vue d'ensemble multi-sites : encaissé, attendu, impayés, occupation ; classement ; recettes − dépenses | ✓            | —      | —       | Lecture            | LM4      |
| T14 | Remises de caisse : détail des paiements, confirmer ou contester avec motif                            | ✓            | —      | —       | Non                | LM4      |
| T15 | Équipe : activité par membre, appareils, opérations en attente ou à corriger, invitations              | ✓            | —      | —       | Non                | LM4      |
| T16 | Alertes et « à corriger » : notifications reçues, opérations refusées à reprendre                      | ✓            | ✓      | ✓       | Lecture            | LM3, LM4 |

## Écrans de parité avec le web (onglet Plus, LM5)

| N°  | Écran                                                                 | Équivalent web                      | Propriétaire   | Gérant           | Hors-ligne   |
| --- | --------------------------------------------------------------------- | ----------------------------------- | -------------- | ---------------- | ------------ |
| W1  | Inscription d'un bailleur et assistant de démarrage                   | Inscription, onboarding             | Nouveau compte | —                | Non          |
| W2  | Impayés détaillés et échéances (ajout, remise, annulation avec motif) | Impayés                             | ✓              | ✓ (selon droits) | Lecture      |
| W3  | Sortie : préavis et clôture (caution, retenues, à rembourser)         | Sortie                              | ✓              | ✓                | Non          |
| W4  | États des lieux avec photos horodatées                                | États des lieux                     | ✓              | ✓                | Oui (photos) |
| W5  | Contrats : liste, création, détail, PDF, signature par code e-mail    | Contrats                            | ✓              | ✓                | Lecture      |
| W6  | Dépenses : liste et filtres                                           | Dépenses                            | ✓              | ✓                | Lecture      |
| W7  | Comptabilité OHADA : journal, consultation, export partagé            | Comptabilité                        | ✓              | ✓                | Non          |
| W8  | Sites : ajouter un site, paramètres (grâce, prorata, meublé)          | Ajouter un site, paramètres du site | ✓              | ✓                | Non          |
| W9  | Chambre : édition, création de chambres en lot                        | Édition d'une chambre               | ✓              | ✓                | Non          |
| W10 | Modèles de messages (relance, reçu, contrat)                          | Modèles                             | ✓              | —                | Non          |
| W11 | Offres et abonnement                                                  | Offres                              | ✓              | —                | Non          |
| W12 | Profil, langue, sécurité (PIN, biométrie), économie de données        | Profil, paramètres                  | ✓              | ✓                | Oui          |
| W13 | Administration : vue d'ensemble et anomalies détectées                | Admin, vue d'ensemble               | ✓              | —                | Non          |
| W14 | Journal d'audit                                                       | Admin, journal d'audit              | ✓              | —                | Non          |
| W15 | Paramètres du compte                                                  | Admin, paramètres                   | ✓              | —                | Non          |

Le gardien n'a accès à aucun écran de parité, conformément à la matrice des droits.
La vérification d'un reçu par QR est intégrée à T7 (bouton Scanner) plutôt qu'à un écran
à part.

## États à dessiner pour chaque écran

Chargement · liste vide (avec l'action à faire) · hors-ligne (bandeau + compteur
d'opérations en attente) · erreur · opération « en attente de synchronisation » · lecture
seule (abonnement expiré).

## Liens profonds (MX9)

| Lien                            | Ouvre                                                                        |
| ------------------------------- | ---------------------------------------------------------------------------- |
| `bailo://payment/<id>`          | Détail d'un paiement (notification « paiement reçu »)                        |
| `bailo://cash-handover/<id>`    | T14, la remise à confirmer                                                   |
| `bailo://ticket/<id>`           | T11, la panne urgente                                                        |
| `bailo://to-fix`                | T16, les opérations à corriger                                               |
| `https://<site>/invite/<jeton>` | Acceptation d'une invitation dans l'app si elle est installée, sinon le site |

## Parcours de démonstration (cahier, section 9.1)

PM1 encaissement sans réseau (T7) · PM2 contrôle à distance (T13, T14) · PM3 tournée de
30 relevés (T10) · PM4 fuite d'eau (T11) · PM5 relances du matin (T9). Les maquettes
doivent permettre de dérouler ces 5 parcours écran par écran.
