-- Contraintes CitéGest non exprimables en Prisma (appliquées après le schéma de base).
-- Versionnées ici pour être posées par `prisma migrate deploy`.

-- ─────────────────────────────────────────────────────────────────────────────
-- RG17 : pas deux occupations ACTIVE/NOTICE chevauchantes sur une unité NON partagée.
-- Postgres interdit une sous-requête dans le WHERE d'une contrainte d'exclusion.
-- On dénormalise donc `unit.shared` sur `occupancy` via une colonne maintenue par trigger,
-- ce qui permet une contrainte d'exclusion 100 % en base.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Colonne dénormalisée (Prisma l'ignore : NOT NULL DEFAULT false, remplie par trigger).
ALTER TABLE "occupancy" ADD COLUMN IF NOT EXISTS "unitShared" boolean NOT NULL DEFAULT false;

-- Le trigger recopie l'état "partagée" de l'unité à chaque insert/update d'occupation.
CREATE OR REPLACE FUNCTION occupancy_sync_unit_shared() RETURNS trigger AS $$
BEGIN
  SELECT shared INTO NEW."unitShared" FROM "unit" WHERE id = NEW."unitId";
  IF NEW."unitShared" IS NULL THEN
    NEW."unitShared" := false;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS occupancy_sync_unit_shared_trg ON "occupancy";
CREATE TRIGGER occupancy_sync_unit_shared_trg
  BEFORE INSERT OR UPDATE OF "unitId" ON "occupancy"
  FOR EACH ROW EXECUTE FUNCTION occupancy_sync_unit_shared();

-- Une occupation « occupe » l'unité de start_date à COALESCE(actual_end_date, planned_end_date, +∞).
ALTER TABLE "occupancy" DROP CONSTRAINT IF EXISTS occupancy_no_overlap;
ALTER TABLE "occupancy"
  ADD CONSTRAINT occupancy_no_overlap
  EXCLUDE USING gist (
    "unitId" WITH =,
    daterange("startDate"::date, COALESCE("actualEndDate", "plannedEndDate")::date, '[]') WITH &&
  )
  WHERE (status IN ('ACTIVE', 'NOTICE') AND "unitShared" = false);

-- ─────────────────────────────────────────────────────────────────────────────
-- Intégrité des allocations (RG6/RG7) : la somme des allocations d'un paiement ne
-- dépasse jamais son montant, ni celle d'une échéance le montant de l'échéance.
-- Garanti aussi par transaction applicative — ces triggers sont un filet de sécurité.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION check_allocation_sums() RETURNS trigger AS $$
DECLARE
  pay_total   integer;
  pay_amount  integer;
  chg_total   integer;
  chg_amount  integer;
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO pay_total FROM "allocation" WHERE "paymentId" = NEW."paymentId";
  SELECT amount INTO pay_amount FROM "payment" WHERE id = NEW."paymentId";
  IF pay_total > pay_amount THEN
    RAISE EXCEPTION 'Somme des allocations (%) > montant du paiement (%)', pay_total, pay_amount;
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO chg_total FROM "allocation" WHERE "chargeId" = NEW."chargeId";
  SELECT amount INTO chg_amount FROM "charge" WHERE id = NEW."chargeId";
  IF chg_total > chg_amount THEN
    RAISE EXCEPTION 'Somme des allocations (%) > montant de l''échéance (%)', chg_total, chg_amount;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS allocation_sums_guard ON "allocation";
CREATE TRIGGER allocation_sums_guard
  AFTER INSERT OR UPDATE ON "allocation"
  FOR EACH ROW EXECUTE FUNCTION check_allocation_sums();
