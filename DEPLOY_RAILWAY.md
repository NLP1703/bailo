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
| `COOKIE_SAMESITE` | `lax` |
| `ENABLE_JOBS` | `false` *(active-le quand tu auras branché Redis — Upstash recommandé)* |
| `SMS_PROVIDER` | `console` *(remplace par ton provider SMS quand prêt)* |
| `PDF_ENGINE` | `html` *(fallback — pas de Chromium sur Railway)* |
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

## 6 · Pour aller plus loin

- **Domaine personnalisé** : *Settings → Networking → Custom Domain* sur `bailo-web`
  (ajoute aussi l'URL custom dans `CORS_ORIGIN` séparée par une virgule :
  `https://bailo-web-xxxx.up.railway.app,https://bailo.ton-domaine.com`).
- **Redis / BullMQ** (relances automatiques quotidiennes) : brancher Upstash gratuit,
  passer `REDIS_URL` dans l'API et `ENABLE_JOBS=true`.
- **Stockage objet** (photos chambres, pièces jointes contrats) : brancher Cloudflare R2
  ou Backblaze B2 (compatibles S3), remplacer les variables `S3_*`.
- **SMS** : brancher un provider local (ex. Twilio, Vonage) et changer `SMS_PROVIDER`.
- **PDF Chromium** : si tu veux les PDFs rendus par Puppeteer plutôt que le fallback HTML,
  étendre `apps/api/Dockerfile` pour installer `chromium` et `freetype ttf-freefont` puis
  passer `PDF_ENGINE=puppeteer` et `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium`.

## Dépannage

| Symptôme | Cause probable |
|---|---|
| `relation "..." does not exist` au premier appel API | migration non appliquée — vérifier les logs du conteneur API |
| `Configuration d'environnement invalide : CORS_ORIGIN doit utiliser HTTPS` | mettre une URL `https://…` complète |
| `JWT_ACCESS_SECRET ressemble à un placeholder` | le secret contient `change-me`, `dev-`, `secret`, `password` — regénérer |
| Web affiche page blanche / erreurs 404 sur refresh | la fallback SPA est dans `nginx.conf` ; vérifier que le service web est bien l'image nginx construite depuis `apps/web/Dockerfile` |
| Appels API bloqués par CORS | `CORS_ORIGIN` ne contient pas l'origine exacte du web (schéma + domaine, sans slash final) |
