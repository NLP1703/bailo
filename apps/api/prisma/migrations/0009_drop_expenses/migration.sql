-- Retrait complet du volet Dépenses (demande du 2026-10-12).
-- Supprime la table + l'enum associé. IRRÉVERSIBLE — les lignes existantes sont perdues.

DROP TABLE IF EXISTS "expense" CASCADE;
DROP TYPE  IF EXISTS "ExpenseCategory";
