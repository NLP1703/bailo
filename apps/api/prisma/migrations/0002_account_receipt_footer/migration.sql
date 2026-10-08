-- F1.5 : mentions libres affichées en pied de reçu (profil du propriétaire).
ALTER TABLE "account" ADD COLUMN IF NOT EXISTS "receiptFooter" text;
