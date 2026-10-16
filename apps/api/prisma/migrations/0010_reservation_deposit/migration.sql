-- Acompte de réservation : montant éventuellement versé par le futur locataire,
-- consommé automatiquement dans le paiement d'ouverture lors de la création d'occupation.
ALTER TABLE "unit" ADD COLUMN IF NOT EXISTS "reservationDepositAmount" INTEGER;
