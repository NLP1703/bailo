import { ForbiddenException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { CashQuery, CreateHandoverDto } from '@citegest/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { toDate } from '../../common/time/to-date';
import type { RequestContext } from '../../common/tenancy/request-context';

@Injectable()
export class CashService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Journal de caisse (espèces) d'un encaisseur + état des remises. */
  async journal(ctx: RequestContext, query: CashQuery) {
    // Le gardien est forcé sur sa propre caisse.
    const collectorId = ctx.role === 'CARETAKER' ? ctx.userId : query.collectorId;
    const paidAt = this.dateRange(query.from, query.to);

    const where: Prisma.PaymentWhereInput = {
      mode: 'ESPECES',
      status: 'VALID',
      ...(collectorId ? { receivedBy: collectorId } : {}),
      ...(paidAt ? { paidAt } : {}),
    };
    const payments = await this.prisma.payment.findMany({
      where,
      orderBy: { paidAt: 'desc' },
      include: { occupancy: { include: { unit: { select: { code: true } } } } },
    });
    const expectedTotal = payments.reduce((s, p) => s + p.amount, 0);

    const handovers = await this.prisma.cashHandover.findMany({
      where: { ...(collectorId ? { collectorId } : {}) },
      orderBy: { createdAt: 'desc' },
    });
    const handedTotal = handovers.reduce((s, h) => s + h.handedAmount, 0);

    return {
      collectorId: collectorId ?? null,
      expectedTotal,
      handedTotal,
      toHand: expectedTotal - handedTotal,
      payments: payments.map((p) => ({
        id: p.id,
        amount: p.amount,
        paidAt: p.paidAt,
        receiptNumber: p.receiptNumber,
        unitCode: p.occupancy.unit.code,
      })),
      handovers,
    };
  }

  /** Remise de caisse : montant attendu (espèces valides de la période) vs remis (écart). */
  async createHandover(ctx: RequestContext, dto: CreateHandoverDto) {
    const periodStart = toDate(dto.periodStart);
    const periodEnd = toDate(dto.periodEnd);

    const aggregate = await this.prisma.payment.aggregate({
      where: {
        mode: 'ESPECES',
        status: 'VALID',
        receivedBy: dto.collectorId,
        paidAt: { gte: periodStart, lte: periodEnd },
      },
      _sum: { amount: true },
    });
    const expected = aggregate._sum.amount ?? 0;
    const variance = dto.handedAmount - expected;

    return this.prisma.$transaction(async (tx) => {
      const handover = await tx.cashHandover.create({
        data: {
          accountId: ctx.accountId,
          collectorId: dto.collectorId,
          periodStart,
          periodEnd,
          expectedAmount: expected,
          handedAmount: dto.handedAmount,
          variance,
          note: dto.note,
          settledAt: new Date(),
        },
      });
      await this.audit.log(tx, {
        accountId: ctx.accountId,
        actorId: ctx.userId,
        entity: 'cash_handover',
        entityId: handover.id,
        action: 'CREATE',
        after: { expected, handed: dto.handedAmount, variance },
      });
      return handover;
    });
  }

  private dateRange(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
    if (!from && !to) return undefined;
    return {
      ...(from ? { gte: toDate(from) } : {}),
      ...(to ? { lte: toDate(to) } : {}),
    };
  }
}

// Garde de type : le gardien ne peut jamais viser la caisse d'un autre encaisseur.
export function assertOwnCash(ctx: RequestContext, collectorId?: string): void {
  if (ctx.role === 'CARETAKER' && collectorId && collectorId !== ctx.userId) {
    throw new ForbiddenException('Un gardien ne consulte que sa propre caisse');
  }
}
