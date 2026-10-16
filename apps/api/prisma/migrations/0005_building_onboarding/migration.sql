-- Nouveau type d'unité « maison ».
ALTER TYPE "UnitType" ADD VALUE IF NOT EXISTS 'MAISON';

-- Caractéristiques saisies à la mise en service : meublé, et description d'une
-- maison (nombre de chambres + liste des pièces).
ALTER TABLE "unit" ADD COLUMN IF NOT EXISTS "furnished" boolean NOT NULL DEFAULT false;
ALTER TABLE "unit" ADD COLUMN IF NOT EXISTS "bedrooms" integer;
ALTER TABLE "unit" ADD COLUMN IF NOT EXISTS "rooms" text[] NOT NULL DEFAULT ARRAY[]::text[];
