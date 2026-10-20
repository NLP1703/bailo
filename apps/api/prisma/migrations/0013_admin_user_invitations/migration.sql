-- Admin Lot 2 : équipe & sessions.
-- - User.invitedAt : horodate la création par invitation (null si créé
--   directement par l'OWNER ou au signup du compte).
-- - invitation : jetons d'invitation (haché), rôle MANAGER/CARETAKER,
--   sites assignés listés en JSON (shape éphémère, pas d'index requis),
--   expiration et consommation. Nettoyée naturellement par TTL applicatif.
-- Migration additive : aucune colonne retirée, aucune donnée réécrite.

ALTER TABLE "user" ADD COLUMN "invitedAt" TIMESTAMP(3);

CREATE TABLE "invitation" (
  "id"         TEXT NOT NULL,
  "accountId"  TEXT NOT NULL,
  "name"       TEXT NOT NULL,
  "email"      TEXT,
  "phone"      TEXT NOT NULL,
  "role"       "UserRole" NOT NULL,
  "siteIds"    JSONB NOT NULL DEFAULT '[]',
  "tokenHash"  TEXT NOT NULL,
  "expiresAt"  TIMESTAMP(3) NOT NULL,
  "usedAt"     TIMESTAMP(3),
  "revokedAt"  TIMESTAMP(3),
  "createdBy"  TEXT NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "invitation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "invitation_tokenHash_key" ON "invitation"("tokenHash");
CREATE INDEX "invitation_accountId_idx" ON "invitation"("accountId");
CREATE INDEX "invitation_accountId_usedAt_revokedAt_idx"
  ON "invitation"("accountId", "usedAt", "revokedAt");

ALTER TABLE "invitation"
  ADD CONSTRAINT "invitation_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
