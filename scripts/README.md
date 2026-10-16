# Scripts

## `generate-secrets.sh` / `generate-secrets.ps1`

Génère des secrets forts (JWT access/refresh, cookie signé, clés S3/MinIO) à partir
de `/dev/urandom` via `openssl` (Linux/macOS) ou `RandomNumberGenerator` (Windows).

### Linux / macOS

```bash
chmod +x scripts/generate-secrets.sh
./scripts/generate-secrets.sh > .env.secrets
# Puis fusionner le contenu dans .env (ou .env.production)
```

### Windows (PowerShell)

```powershell
.\scripts\generate-secrets.ps1 > .env.secrets
```

### Règles de sécurité

- **Ne jamais commiter** `.env`, `.env.production`, `.env.secrets` — déjà exclus par `.gitignore`.
- **Rotation annuelle minimum** des secrets JWT en production. Lors d'une rotation, prévoir une
  période de double-signature pour ne pas invalider les sessions actives (ou accepter l'invalidation).
- Les secrets de production **ne doivent jamais** passer par un fichier `.env` sur le serveur :
  utiliser Docker secrets, HashiCorp Vault, ou l'équivalent du fournisseur cloud.
- Le validateur `env.ts` **rejette** tout secret < 32 caractères en production, ainsi que les
  patterns `change-me`, `dev-*`, `secret*`, `password*`.
