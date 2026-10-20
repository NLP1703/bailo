-- Admin Lot 3 : siteId optionnel sur AuditLog pour restreindre la lecture du
-- journal aux sites assignés d'un MANAGER. Les écritures existantes gardent
-- siteId NULL — un MANAGER voit alors ces lignes « non-site » (compat
-- ascendante, aucune donnée masquée rétroactivement). Les nouveaux call-sites
-- qui connaissent le site le propagent ; sinon le comportement reste le même.
-- Additive, aucune donnée touchée.

ALTER TABLE "audit_log" ADD COLUMN "siteId" TEXT;

CREATE INDEX "audit_log_accountId_siteId_createdAt_idx"
  ON "audit_log"("accountId", "siteId", "createdAt" DESC);

ALTER TABLE "audit_log"
  ADD CONSTRAINT "audit_log_siteId_fkey"
  FOREIGN KEY ("siteId") REFERENCES "site"("id") ON DELETE SET NULL ON UPDATE CASCADE;
