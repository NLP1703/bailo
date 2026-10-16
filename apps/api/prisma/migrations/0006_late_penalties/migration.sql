-- Pénalités de retard paramétrables par site (F5.6).
CREATE TYPE "PenaltyMode" AS ENUM ('FIXED', 'PERCENT');

ALTER TABLE "site" ADD COLUMN IF NOT EXISTS "penaltyEnabled" boolean NOT NULL DEFAULT false;
ALTER TABLE "site" ADD COLUMN IF NOT EXISTS "penaltyMode" "PenaltyMode" NOT NULL DEFAULT 'FIXED';
ALTER TABLE "site" ADD COLUMN IF NOT EXISTS "penaltyValue" integer NOT NULL DEFAULT 0;
ALTER TABLE "site" ADD COLUMN IF NOT EXISTS "penaltyGraceDays" integer NOT NULL DEFAULT 0;

-- Lien pénalité -> échéance d'origine (une seule pénalité par échéance en retard).
ALTER TABLE "charge" ADD COLUMN IF NOT EXISTS "penaltyForChargeId" text;
CREATE UNIQUE INDEX IF NOT EXISTS "charge_penaltyForChargeId_key" ON "charge"("penaltyForChargeId");
