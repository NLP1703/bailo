# Déploiement Bailo sur Railway

Trois services, un seul dépôt GitHub (`NLP1703/bailo`).

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  bailo-web   │───▶│  bailo-api   │───▶│  Postgres    │
│  (nginx)     │    │  (NestJS)    │    │  (Railway)   │
└──────────────┘    └──────────────┘    └──────────────┘
   port 80            port injecté       plugin managé
```

## 1 · Créer le projet et la base

1. Ouvrir **https://railway.com/new/github** puis sélectionner le dépôt **`NLP1703/bailo`**.
2. À l'écran « Configure », laisser Railway créer le premier service — on va le reconfigurer.
3. Dans le projet, cliquer **+ New → Database → Add PostgreSQL**. Railway provisionne un
   Postgres managé et expose automatiquement `DATABASE_URL`, `PGHOST`, `PGUSER`, etc.
4. Dans l'onglet **Data** du service Postgres, cliquer **Connect → Query**, exécuter :
   ```sql
   CREATE EXTENSION IF NOT EXISTS btree_gist;
   ```
   (nécessaire pour la contrainte d'anti-chevauchement des occupancies).

## 2 · Service API (`bailo-api`)

Renommer le premier service créé en **`bailo-api`** puis dans **Settings** :

- **Source → Root Directory** : `/` (racine du dépôt)
- **Build → Builder** : `Dockerfile`
- **Build → Dockerfile Path** : `apps/api/Dockerfile`
- **Networking** : cliquer **Generate Domain** → on obtient par exemple
  `bailo-api-production-xxxx.up.railway.app`

Dans **Variables**, ajouter :

| Variable | Valeur |
|---|---|
| `NODE_ENV` | `production` |
| `TZ` | `Africa/Douala` |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` *(référence)* |
| `CORS_ORIGIN` | `https://bailo-web-production-xxxx.up.railway.app` *(l'URL web — à mettre à jour après l'étape 3)* |
| `PUBLIC_API_URL` | `https://bailo-api-production-xxxx.up.railway.app` *(l'URL de ce service)* |
| `PUBLIC_RECEIPT_BASE` | `https://bailo-web-production-xxxx.up.railway.app/r` |
| `JWT_ACCESS_SECRET` | généré via `openssl rand -base64 48` (≥ 32 car) |
| `JWT_REFRESH_SECRET` | généré via `openssl rand -base64 48` (≥ 32 car) |
| `COOKIE_SECRET` | généré via `openssl rand -base64 32` |
| `COOKIE_SECURE` | `true` |
| `COOKIE_SAMESITE` | `lax` *(le front relaie `/api` sur son domaine : cookie first-party)* |
| `ENABLE_JOBS` | `false` *(active-le quand tu auras branché Redis — Upstash recommandé)* |
| `SMS_PROVIDER` | `console` *(⚠️ interdit en prod : OTP en échec tant qu'il n'est pas remplacé — voir §6)* |
| `PDF_ENGINE` | `html` *(ou `puppeteer` avec `INSTALL_CHROMIUM=true` — voir §6)* |
| `S3_ENDPOINT` | `https://disabled.local` *(placeholder — stockage objet non branché)* |
| `S3_INTERNAL_ENDPOINT` | `https://disabled.local` |
| `S3_ACCESS_KEY` | `railway-placeholder` *(≠ `minioadmin`)* |
| `S3_SECRET_KEY` | `railway-placeholder` *(≠ `minioadmin`)* |
| `S3_BUCKET` | `bailo` |

> **Astuce secrets** : clique l'icône « dés » dans Railway pour générer une valeur aléatoire,
> ou lance localement `openssl rand -base64 48` et colle le résultat.

Cliquer **Deploy**. Le build fait `pnpm install → prisma generate → nest build`, puis le
conteneur applique `prisma migrate deploy` et démarre.

Pour seeder la démo (optionnel) : onglet **Settings → Service → Start Command** temporaire
→ `pnpm exec prisma migrate deploy && pnpm seed` → redéployer, puis remettre la commande
d'origine.

## 3 · Service Web (`bailo-web`)

Dans le projet, **+ New → GitHub Repo** → même dépôt `NLP1703/bailo`, nommer **`bailo-web`**.

**Settings** :

- **Source → Root Directory** : `/`
- **Build → Dockerfile Path** : `apps/web/Dockerfile`
- **Networking** : **Generate Domain** → `bailo-web-production-xxxx.up.railway.app`

**Variables** (lues au BUILD par Vite — Railway les transmet comme `ARG` Docker) :

| Variable | Valeur |
|---|---|
| `VITE_API_URL` | `https://bailo-api-production-xxxx.up.railway.app/api/v1` |
| `VITE_PUBLIC_RECEIPT_BASE` | `https://bailo-web-production-xxxx.up.railway.app/r` |

> **Proxy same-origin** : le conteneur web relaie `/api/*` vers l'origine de `VITE_API_URL`
> (lue au démarrage, Railway l'expose aussi à l'exécution). Le front appelle donc `/api/v1` sur
> son propre domaine et le cookie de session reste first-party (Safari/iOS compris).
> Pour passer par le réseau privé Railway, définir `API_UPSTREAM`
> (ex. `http://bailo.railway.internal:8080`, port = `PORT` du service API).

Cliquer **Deploy**.

## 4 · Boucler la configuration CORS

Une fois le domaine web connu, retourner sur `bailo-api` → **Variables** → mettre à jour
`CORS_ORIGIN` avec l'URL web (`https://bailo-web-production-xxxx.up.railway.app`). Railway
redéploie l'API automatiquement.

## 5 · Vérifier

- `https://<bailo-api>/health` → `{ "status": "ok" }`
- `https://<bailo-api>/api/docs` → Swagger
- `https://<bailo-web>/` → écran de connexion Bailo

Première inscription : utiliser **Signup** depuis l'écran de connexion (crée le compte
`OWNER` et un premier site).

## 6 · Brancher les services externes

Chaque bloc = variables à ajouter sur le service indiqué ; Railway redéploie seul.

### Stockage objet — Cloudflare R2 (photos, pièces jointes, logo des reçus)

Le bucket **`bailo`** existe déjà dans le compte Cloudflare.

1. Cloudflare → **R2 → Manage R2 API Tokens → Create API token** : permission
   *Object Read & Write*, limité au bucket `bailo`. Noter *Access Key ID*, *Secret Access Key*
   et l'endpoint `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`.
2. R2 → bucket `bailo` → **Settings → CORS policy** (le navigateur dépose les fichiers
   directement, l'API ne fait que signer) :
   ```json
   [
     {
       "AllowedOrigins": ["https://bailo-web-production.up.railway.app"],
       "AllowedMethods": ["GET", "PUT"],
       "AllowedHeaders": ["*"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```
   (ajouter le domaine personnalisé le jour venu).
3. Service **API** :

| Variable | Valeur |
|---|---|
| `S3_ENDPOINT` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| `S3_INTERNAL_ENDPOINT` | même valeur |
| `S3_REGION` | `auto` |
| `S3_BUCKET` | `bailo` |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | clés du jeton R2 |
| `S3_FORCE_PATH_STYLE` | `true` |

Vérifier : `GET /api/v1/files/status` → `{ "enabled": true }`, puis ajouter une photo de chambre.

### Relances automatiques — Redis (Upstash)

Créer une base Redis gratuite sur Upstash, puis service **API** : `REDIS_URL=rediss://…`
(URL TLS fournie par Upstash) et `ENABLE_JOBS=true`. La maintenance tourne à 02:00 (Douala) :
statuts, pénalités, relances du jour, prolongation des échéanciers.

### SMS — Africa's Talking (OTP, signature de contrat)

1. Créer une application sur africastalking.com ; tester d'abord en bac à sable
   (`SMS_USERNAME=sandbox`, clé du sandbox).
2. **Vérifier la couverture Cameroun** (MTN / Orange) et demander un identifiant d'expéditeur.
3. Service **API** : `SMS_PROVIDER=africastalking`, `SMS_USERNAME`, `SMS_API_KEY`,
   `SMS_SENDER_ID` (optionnel). L'API refuse de démarrer s'il manque le nom ou la clé.

### Monitoring — Sentry (optionnel)

Créer deux projets Sentry (Node et React). Service **API** : `SENTRY_DSN`. Service **web** :
`VITE_SENTRY_DSN` (variable de build). Aucune donnée personnelle n'est envoyée.

### PDF Chromium (optionnel)

Service **API** : `INSTALL_CHROMIUM=true` (lue au build, image +300 Mo) et
`PDF_ENGINE=puppeteer`. Sans cela, reçus et contrats sont servis en HTML imprimable.

### Sauvegardes Postgres

Activer les sauvegardes du service Postgres Railway (onglet **Backups**), ou planifier
`scripts/backup-postgres.sh` vers un stockage **privé** : les dumps contiennent des données
de locataires — jamais d'artefact public (le dépôt GitHub est public).

### Domaine personnalisé

*Settings → Networking → Custom Domain* sur `bailo-web` uniquement (l'API passe par le proxy) ;
ajouter le domaine à `CORS_ORIGIN` et à la règle CORS du bucket R2, et mettre à jour
`PUBLIC_RECEIPT_BASE`.

## Dépannage

| Symptôme | Cause probable |
|---|---|
| `relation "..." does not exist` au premier appel API | migration non appliquée — vérifier les logs du conteneur API |
| `Configuration d'environnement invalide : CORS_ORIGIN doit utiliser HTTPS` | mettre une URL `https://…` complète |
| `JWT_ACCESS_SECRET ressemble à un placeholder` | le secret contient `change-me`, `dev-`, `secret`, `password` — regénérer |
| Web affiche page blanche / erreurs 404 sur refresh | la fallback SPA est dans `nginx.conf` ; vérifier que le service web est bien l'image nginx construite depuis `apps/web/Dockerfile` |
| Appels API bloqués par CORS | `CORS_ORIGIN` ne contient pas l'origine exacte du web (schéma + domaine, sans slash final) |
| `/api/...` renvoie la page d'accueil | proxy absent : vérifier `VITE_API_URL` (URL absolue) ou `API_UPSTREAM` sur `bailo-web` ; les logs du conteneur affichent `bailo: proxy /api -> …` |
| Déconnexion à chaque rechargement | cookie `bailo_rt` non posé : `COOKIE_SECURE=true` exige HTTPS ; vérifier que le front appelle bien `/api/v1` relatif |
| Upload refusé (CORS) côté navigateur | règle CORS du bucket R2 absente ou origine différente |
| `Fournisseur SMS "console" interdit en production` | brancher Africa's Talking (§6) |
