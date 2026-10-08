-- Correctif : le filet de sécurité `check_allocation_sums` ne doit compter, pour une
-- échéance, que les allocations liées à des paiements VALID (définition métier du « payé » :
-- cf. BalanceService.paidByCharge). Sans ce filtre, un paiement annulé continuait à peser
-- sur l'échéance et bloquait un nouveau paiement sur la même échéance (faux positif).

CREATE OR REPLACE FUNCTION check_allocation_sums() RETURNS trigger AS $$
DECLARE
  pay_total   integer;
  pay_amount  integer;
  chg_total   integer;
  chg_amount  integer;
BEGIN
  -- Les allocations d'un paiement ne dépassent jamais son montant (le paiement courant est valide).
  SELECT COALESCE(SUM(amount), 0) INTO pay_total FROM "allocation" WHERE "paymentId" = NEW."paymentId";
  SELECT amount INTO pay_amount FROM "payment" WHERE id = NEW."paymentId";
  IF pay_total > pay_amount THEN
    RAISE EXCEPTION 'Somme des allocations (%) > montant du paiement (%)', pay_total, pay_amount;
  END IF;

  -- Pour l'échéance, ne compter que les allocations de paiements VALID (un paiement annulé
  -- libère l'échéance).
  SELECT COALESCE(SUM(a.amount), 0) INTO chg_total
    FROM "allocation" a
    JOIN "payment" p ON p.id = a."paymentId"
    WHERE a."chargeId" = NEW."chargeId" AND p.status = 'VALID';
  SELECT amount INTO chg_amount FROM "charge" WHERE id = NEW."chargeId";
  IF chg_total > chg_amount THEN
    RAISE EXCEPTION 'Somme des allocations (%) > montant de l''échéance (%)', chg_total, chg_amount;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
