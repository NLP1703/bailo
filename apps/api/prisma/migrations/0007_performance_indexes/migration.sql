-- Index composites pour performance (audit 5.1).
-- CONCURRENTLY : création sans verrou lourd (production). En migration dev, retirer CONCURRENTLY.

CREATE INDEX IF NOT EXISTS "charge_status_dueDate_idx"      ON "charge"    ("status", "dueDate");
CREATE INDEX IF NOT EXISTS "charge_accountId_dueDate_idx"   ON "charge"    ("accountId", "dueDate");
CREATE INDEX IF NOT EXISTS "charge_accountId_status_idx"    ON "charge"    ("accountId", "status");

CREATE INDEX IF NOT EXISTS "payment_accountId_paidAt_idx"   ON "payment"   ("accountId", "paidAt");
CREATE INDEX IF NOT EXISTS "payment_accountId_status_idx"   ON "payment"   ("accountId", "status");

CREATE INDEX IF NOT EXISTS "occupancy_accountId_status_idx" ON "occupancy" ("accountId", "status");
CREATE INDEX IF NOT EXISTS "occupancy_chargesGeneratedUntil_idx" ON "occupancy" ("chargesGeneratedUntil");
