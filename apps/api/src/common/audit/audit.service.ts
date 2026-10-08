import { Injectable } from '@nestjs/common';
import type { Prisma, AuditAction } from '@prisma/client';

export interface AuditEntry {
  accountId: string;
  actorId: string;
  entity: string;
  entityId: string;
  action: AuditAction;
  before?: unknown;
  after?: unknown;
  reason?: string;
}

/**
 * Journal d'audit non modifiable des opérations financières (RG21, NF11).
 * On écrit toujours dans la même transaction que l'opération auditée : pas d'audit
 * sans écriture, pas d'écriture sans audit.
 *
 * ⚠️ Aucune donnée personnelle sensible dans `before/after` : on n'y met que des
 * champs financiers (montants, statuts, motifs), jamais de pièce d'identité.
 */
@Injectable()
export class AuditService {
  async log(tx: Prisma.TransactionClient, entry: AuditEntry): Promise<void> {
    await tx.auditLog.create({
      data: {
        accountId: entry.accountId,
        actorId: entry.actorId,
        entity: entry.entity,
        entityId: entry.entityId,
        action: entry.action,
        before: (entry.before ?? undefined) as Prisma.InputJsonValue | undefined,
        after: (entry.after ?? undefined) as Prisma.InputJsonValue | undefined,
        reason: entry.reason,
      },
    });
  }
}
