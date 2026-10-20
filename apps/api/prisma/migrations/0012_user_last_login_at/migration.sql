-- Admin Lot 1 : horodatage de dernière connexion de chaque utilisateur,
-- alimenté par AuthService.login(), utilisé par la vue d'ensemble Admin
-- (listes "qui s'est connecté récemment", détection d'inactifs, support).
-- Migration additive : colonne nullable, aucune donnée réécrite.

ALTER TABLE "user" ADD COLUMN "lastLoginAt" TIMESTAMP(3);

-- Index pour trier rapidement DESC NULLS LAST sur la vue d'ensemble.
CREATE INDEX "user_accountId_lastLoginAt_idx" ON "user"("accountId", "lastLoginAt" DESC);
