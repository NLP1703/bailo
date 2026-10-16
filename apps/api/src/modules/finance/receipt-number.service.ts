import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { formatReceiptNumber } from '@bailo/shared';

/**
 * Numéro de reçu continu par compte (RG9). L'incrément est atomique (upsert avec
 * `increment` sur la ligne (compte, année), verrouillée le temps de la transaction).
 * À appeler DANS la transaction du paiement.
 */
@Injectable()
export class ReceiptNumberService {
  async next(
    tx: Prisma.TransactionClient,
    params: { accountId: string; prefix: string; year: number },
  ): Promise<string> {
    const seq = await tx.receiptSequence.upsert({
      where: { accountId_year: { accountId: params.accountId, year: params.year } },
      create: { accountId: params.accountId, year: params.year, lastValue: 1 },
      update: { lastValue: { increment: 1 } },
    });
    return formatReceiptNumber(params.prefix, params.year, seq.lastValue);
  }
}
