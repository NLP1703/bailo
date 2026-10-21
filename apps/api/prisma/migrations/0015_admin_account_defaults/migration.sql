-- Admin Lot 4 : regles par defaut appliquees aux nouveaux sites (penalite,
-- prorata). Les sites existants gardent leurs propres valeurs ; ces champs
-- servent seulement de valeurs d'amorcage a la creation d'un nouveau site
-- depuis l'onboarding. Additive, aucune donnee touchee.

ALTER TABLE "account"
  ADD COLUMN "defaultPenaltyEnabled"   BOOLEAN      NOT NULL DEFAULT false,
  ADD COLUMN "defaultPenaltyMode"      "PenaltyMode" NOT NULL DEFAULT 'FIXED',
  ADD COLUMN "defaultPenaltyValue"     INTEGER      NOT NULL DEFAULT 0,
  ADD COLUMN "defaultPenaltyGraceDays" INTEGER      NOT NULL DEFAULT 0,
  ADD COLUMN "defaultProrataMode"      "ProrataMode" NOT NULL DEFAULT 'FULL';
