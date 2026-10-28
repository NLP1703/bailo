# Appareils de test

La recette de la M1 se fait sur l'**appareil de référence** du cahier n°2 (section 7) :
un Android d'entrée de gamme avec 2 Go de RAM, 16 Go de stockage et une connexion 3G
intermittente. Si l'application est fluide sur lui, elle l'est sur les téléphones des
gardiens.

## Appareils à réunir

| Rôle                | Critères                                                                                        | Appareil retenu | Version Android |
| ------------------- | ----------------------------------------------------------------------------------------------- | --------------- | --------------- |
| Référence (recette) | 2 Go de RAM, 16 Go, Android 8 à 10                                                              | _à choisir_     | —               |
| Courant             | 3 à 4 Go de RAM, Android 11 à 13, marque répandue au Cameroun (Tecno, Infinix, itel, Samsung A) | _à choisir_     | —               |
| Récent              | Android 14 ou plus (règles récentes de notifications et de permissions)                         | _à choisir_     | —               |
| iOS (M2)            | iPhone sous iOS 15 ou plus                                                                      | _plus tard_     | —               |

À défaut d'un appareil physique pour un rôle, un émulateur Android Studio réglé sur la même
version et la même mémoire sert au développement, mais la recette se fait sur un vrai
téléphone : les économiseurs de batterie des fabricants (notifications bloquées) ne se
voient que sur l'appareil réel.

## Ce qu'on mesure sur l'appareil de référence

| Mesure                                         | Seuil                        | Exigence |
| ---------------------------------------------- | ---------------------------- | -------- |
| Taille de l'application installée              | < 40 Mo                      | NFM2     |
| Taille de la base locale, site de 100 chambres | < 50 Mo                      | NFM2     |
| Ouverture à froid jusqu'à l'écran utile        | < 3 s                        | NFM3     |
| Gestes pour atteindre Encaisser                | 2 au plus                    | NFM3     |
| Encaissement complet                           | < 20 s                       | MG3.1    |
| Données d'une synchro courante                 | < 200 Ko                     | NFM4     |
| Poids d'une photo envoyée                      | < 300 Ko                     | NFM4     |
| Fonctionnement sans réseau                     | 7 jours                      | NFM6     |
| Lisibilité en plein soleil, zones tactiles     | ≥ 48 dp, contraste suffisant | NFM11    |

## Conditions réseau à simuler

Mode avion · 3G lente (limiteur de débit) · coupure en pleine synchronisation ·
réseau qui revient et repart toutes les quelques secondes.
