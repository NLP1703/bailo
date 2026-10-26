-- Adresse e-mail du locataire : reçoit le code de signature du contrat
-- (les notifications passent par e-mail, plus par SMS).
ALTER TABLE "tenant" ADD COLUMN "email" TEXT;
