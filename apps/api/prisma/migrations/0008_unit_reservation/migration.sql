-- Réservation d'unité : date d'arrivée prévue + nom du futur locataire.
-- La maintenance quotidienne rebascule l'unité en AVAILABLE à partir de reservedUntil.
ALTER TABLE "unit"
  ADD COLUMN IF NOT EXISTS "reservedUntil" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reservedFor"   TEXT;

CREATE INDEX IF NOT EXISTS "unit_reservedUntil_idx" ON "unit" ("reservedUntil");
