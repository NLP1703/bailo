# Bailo — Lot 8 · Durcissement production

Solde de la « Phase 2+ » de [`IMPROVEMENTS.md`](IMPROVEMENTS.md) : sécurité des sessions,
performance de la maintenance quotidienne, pagination, monitoring, notifications par e-mail, et préparation
de l'infrastructure (stockage R2, PDF Chromium).

## 1. Sessions en cookie HttpOnly (1.2)

**Avant** : jetons d'accès et de refresh dans `localStorage` (`at` / `rt`), lisibles par
n'importe quel script injecté (XSS).

**Après** :

| Jeton            | Où il vit                                                | Durée  |
| ---------------- | -------------------------------------------------------- | ------ |
| Accès (JWT)      | **Mémoire** du front uniquement (jamais persisté)        | 15 min |
| Refresh (opaque) | Cookie **HttpOnly** `bailo_rt`, `Path=/api/v1/auth`, Lax | 30 j   |

- `POST /auth/login|signup|refresh` posent le cookie et ne renvoient **plus** le refresh
  dans le corps. `POST /auth/logout` révoque le refresh du cookie et l'efface.
- **Clients natifs** (future app mobile, scripts) : en-tête `X-Bailo-Client: native` → le
  refresh est renvoyé dans le corps et accepté dans le corps, comme avant.
- **Migration transparente** : au premier chargement après mise à jour, le front présente
  une dernière fois l'ancien `rt` de `localStorage` ; l'API le convertit en cookie, puis les
  anciennes clés sont effacées. Aucun utilisateur n'est déconnecté.
- Au démarrage, le jeton d'accès est régénéré via le cookie. **Hors-ligne**, l'app rouvre avec
  le dernier profil connu (`bailo.me`, sans secret) : la saisie hors-ligne (NF3) reste possible.
- Rotations concurrentes mutualisées (un seul `refresh` en vol) : pas de faux « session expirée ».
- À la déconnexion, le cache `api` du service worker est purgé (appareil partagé).

### Proxy same-origin (indispensable sur Railway)

Web et API sont sur deux sous-domaines `*.up.railway.app`, que les navigateurs traitent comme
**deux sites distincts** : Safari/iOS bloquerait le cookie. L'image web relaie donc `/api/*`
vers l'API (nginx) : le front appelle `/api/v1` sur **son propre domaine**, le cookie est
first-party.

- `apps/web/docker/40-bailo-api-proxy.sh` génère le proxy au démarrage du conteneur.
  Cible : `API_UPSTREAM`, sinon l'origine de `VITE_API_URL` (déjà définie sur Railway) —
  **aucune variable à ajouter**.
- Sans cible (Docker Compose), pas de proxy : Caddy route déjà `/api`.
- `VITE_API_SAME_ORIGIN=true` (défaut de l'image) : le front ignore l'URL absolue au build.

| Fichier                                                        | Rôle                                                        |
| -------------------------------------------------------------- | ----------------------------------------------------------- |
| `apps/api/src/modules/auth/refresh-cookie.ts`                  | Lecture / pose / effacement du cookie                       |
| `apps/api/src/modules/auth/auth.controller.ts`                 | Routes auth en mode cookie                                  |
| `apps/web/src/lib/api.ts`                                      | Jeton en mémoire, `authFetch`, migration, rotation partagée |
| `apps/web/src/lib/auth.tsx`                                    | Démarrage par cookie, mode hors-ligne                       |
| `apps/web/nginx.conf`, `apps/web/docker/40-bailo-api-proxy.sh` | Proxy `/api`                                                |

## 2. Maintenance quotidienne sans N+1 (2.1)

`apps/api/src/modules/jobs/maintenance.service.ts` :

| Étape                     | Avant                                           | Après                                                          |
| ------------------------- | ----------------------------------------------- | -------------------------------------------------------------- |
| Statuts des échéances     | 1 lecture globale + 1 `UPDATE` par échéance     | Lots de 1 000 (curseur) + 1 `updateMany` par statut et par lot |
| Pénalités                 | 1 `findUnique` + 1 `create` par loyer en retard | 1 lecture des pénalités existantes + 1 `createMany` par site   |
| Prolongation d'échéancier | 12 `upsert` par occupation                      | 1 `createMany(skipDuplicates)` + borne, dans une transaction   |

Idempotence conservée (`skipDuplicates` sur les contraintes uniques). Test :
`apps/api/test/maintenance-jobs.e2e.spec.ts` (+ `penalties.e2e.spec.ts` existant).

## 3. Pagination des listes (2.2)

`GET /expenses`, `/maintenance`, `/contracts`, `/reminders` acceptent `?page=&pageSize=`
(1–100). **Sans `pageSize`, réponse inchangée** (tableau complet) : aucun écran existant ne
change. Avec `pageSize` : `{ items, total, page, pageSize }`, ordre stable (départage par `id`).
Utilitaire : `apps/api/src/common/http/paginate.ts`. Test : `apps/api/test/pagination.e2e.spec.ts`.

## 4. Monitoring Sentry (6.4)

Inactif sans DSN. **Aucune donnée personnelle** envoyée : cookies, en-têtes, corps, paramètres
d'URL et fils d'Ariane console désactivés ; seuls la pile d'erreur et des étiquettes
techniques (id de requête, route, compte) partent.

- **API** : `SENTRY_DSN`. Filtre global `AllExceptionsFilter` — signale les exceptions
  inattendues et les 5xx (pas les 4xx métier) ; échecs de la maintenance quotidienne aussi.
- **Web** : `VITE_SENTRY_DSN` (variable de build). SDK chargé à la demande : sans DSN il n'est
  jamais téléchargé (bundle inchangé à 0,3 Ko près).

## 5. Notifications par e-mail (8.1)

Le SMS est abandonné : les codes de vérification partent **par e-mail**, via l'API HTTPS de
**Brevo** ou **Resend** (`EMAIL_PROVIDER`, `EMAIL_API_KEY`, `EMAIL_FROM`). Railway bloque le
SMTP sortant hors offre Pro, d'où le choix d'une API.

| Parcours                | Avant                            | Après                                                                                                             |
| ----------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Mot de passe oublié     | Route API seule, **aucun écran** | Écran `/forgot-password` (lien « Mot de passe oublié ? » sur la connexion) : e-mail → code → nouveau mot de passe |
| Reset lancé par l'admin | Code par SMS au téléphone        | Code à l'e-mail de l'utilisateur ; bouton grisé sans e-mail ; e-mail modifiable dans la fiche                     |
| Signature de contrat    | Code par SMS au locataire        | Code par e-mail au locataire ; nouveau champ **e-mail du locataire** (saisie à l'entrée, ajout sur la fiche)      |

- `POST /auth/otp` accepte `{ email }` ou `{ phone }` : même réponse que le compte existe ou
  non (pas d'énumération), **3 demandes par quart d'heure** et par identifiant.
- `POST /auth/password-reset` accepte `{ email | phone, otp, newPassword }`.
- **Faille corrigée** : à la signature d'un contrat, le compteur d'essais ratés était
  incrémenté dans une transaction ensuite annulée — il ne montait jamais, le code pouvait être
  tenté sans limite. Désormais compté hors transaction, blocage après `OTP_MAX_ATTEMPTS`,
  consommation atomique du code.
- Gabarits HTML sobres (`apps/api/src/modules/mail/mail.templates.ts`), valeurs échappées ;
  journaux avec adresses masquées, jamais le code.
- Migration `0016_tenant_email`. Module SMS supprimé.
- Les **invitations** ne sont pas envoyées par e-mail : il n'existe pas encore d'écran
  d'acceptation (`/invite/:token`), le lien mènerait nulle part.

## 6. Infrastructure

- **Stockage R2** : le signataire SigV4 maison a été vérifié contre le signataire officiel
  AWS sur une configuration R2 (`region=auto`, path-style) — signatures identiques. Bucket
  `bailo` créé le 26/10/2026. Reste : clés d'accès + règle CORS (voir `DEPLOY_RAILWAY.md`).
- **PDF Chromium** : build arg `INSTALL_CHROMIUM=true` sur l'image API (Chromium système,
  ~300 Mo) ; `PDF_ENGINE=html` évite toute tentative de lancement de Chromium.
  Puppeteer ne télécharge plus de navigateur au build (gain de temps).
- **Config** : une variable vide (`VAR=`) vaut « absente » ; `SameSite=None` sans `Secure`
  est refusé au démarrage.

## Vérifications

- Tests unitaires : filtre de monitoring, fournisseurs et gabarits e-mail, validation de l'environnement.
- Tests e2e : auth en cookie (pose, rotation, rejeu refusé, déconnexion, migration, client
  natif), mot de passe oublié par e-mail, reset admin, signature de contrat (limite d'essais),
  pagination, maintenance groupée.
- Proxy nginx testé contre un serveur factice (chemin, query, cookie et `Set-Cookie`
  relayés ; pas de proxy sans cible).
