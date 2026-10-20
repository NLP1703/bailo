import { Injectable, NotFoundException } from '@nestjs/common';
import type { Anomaly, Prisma } from '@prisma/client';
import type {
  AnomaliesQuery,
  PriceSuggestion,
  ReliabilityScoreView,
  ResolveAnomalyDto,
} from '@bailo/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { RequestContext } from '../../common/tenancy/request-context';

@Injectable()
export class InsightsService {
  constructor(private readonly prisma: PrismaService) {}

  async anomalies(ctx: RequestContext, q: AnomaliesQuery) {
    return this.prisma.anomaly.findMany({
      where: {
        accountId: ctx.accountId,
        ...(q.kind ? { kind: q.kind } : {}),
        ...(q.siteId ? { siteId: q.siteId } : {}),
        ...(q.includeResolved ? {} : { resolvedAt: null }),
      },
      orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });
  }

  async resolveAnomaly(ctx: RequestContext, id: string, dto: ResolveAnomalyDto): Promise<Anomaly> {
    const a = await this.prisma.anomaly.findUnique({ where: { id } });
    if (!a || a.accountId !== ctx.accountId) throw new NotFoundException();
    return this.prisma.anomaly.update({
      where: { id },
      // Fusion non typée de JSON Prisma — un cast ciblé évite d'étaler le schéma
      // d'`Anomaly.context` ici (il varie selon `kind`).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { resolvedAt: new Date(), resolvedBy: ctx.userId, context: { ...((a.context as any) ?? {}), resolveNote: dto.note } as Prisma.InputJsonValue },
    });
  }

  /** Score 0..100 d'un locataire basé sur ses paiements (ponctualité). */
  async reliabilityScore(ctx: RequestContext, tenantId: string): Promise<ReliabilityScoreView> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { accountId: true } });
    if (!tenant || tenant.accountId !== ctx.accountId) throw new NotFoundException();
    // On regarde toutes les échéances LOYER + leur date de paiement effective.
    const charges = await this.prisma.charge.findMany({
      where: { accountId: ctx.accountId, type: 'LOYER', occupancy: { tenantId } },
      include: { allocations: { include: { payment: { select: { paidAt: true, status: true } } } } },
    });
    let total = 0, onTime = 0, delaySum = 0, paidCount = 0;
    for (const c of charges) {
      if (c.status === 'PAID') {
        total++;
        const lastPay = c.allocations.filter((a) => a.payment.status === 'VALID').map((a) => a.payment.paidAt).sort().at(-1);
        if (lastPay) {
          paidCount++;
          const d = Math.max(0, Math.round((lastPay.getTime() - c.dueDate.getTime()) / 86400000));
          delaySum += d;
          if (d <= 2) onTime++;
        }
      } else if (c.status === 'OVERDUE') {
        total++;
      }
    }
    const onTimeRate = total > 0 ? onTime / total : 0;
    const avgDelayDays = paidCount > 0 ? delaySum / paidCount : 0;
    // Formule simple : part des mois payés à l'heure - pénalité par jour moyen de retard.
    const base = onTimeRate * 100;
    const penalty = Math.min(40, avgDelayDays * 1.5);
    const score = total >= 2 ? Math.max(0, Math.min(100, Math.round(base - penalty))) : null;
    if (score !== null) {
      await this.prisma.tenant.update({ where: { id: tenantId }, data: { reliabilityScore: score } });
    }
    return {
      tenantId,
      score: score ?? 0,
      onTimeRate,
      avgDelayDays: Math.round(avgDelayDays * 10) / 10,
      totalPayments: paidCount,
      computedAt: new Date().toISOString(),
    };
  }

  /** Fourchette de prix suggérée pour un site : moyenne du site + référence quartier (si définie). */
  async priceSuggestion(ctx: RequestContext, siteId: string): Promise<PriceSuggestion> {
    const site = await this.prisma.site.findUnique({ where: { id: siteId }, select: { accountId: true, district: true, marketReferenceRent: true } });
    if (!site || site.accountId !== ctx.accountId) throw new NotFoundException();
    const units = await this.prisma.unit.findMany({ where: { siteId, accountId: ctx.accountId }, select: { baseRent: true } });
    const rents = units.map((u) => u.baseRent).filter((r) => r > 0);
    const avg = rents.length ? Math.round(rents.reduce((a, b) => a + b, 0) / rents.length) : 0;
    const suggestion = site.marketReferenceRent ?? avg;
    return {
      siteId,
      district: site.district,
      marketReferenceRent: site.marketReferenceRent,
      avgSiteRent: avg,
      minSiteRent: rents.length ? Math.min(...rents) : 0,
      maxSiteRent: rents.length ? Math.max(...rents) : 0,
      suggestion,
    };
  }

  /**
   * Détection d'anomalies — balaie les règles heuristiques et insère/replace les anomalies.
   * À appeler depuis un job quotidien (voir JobsModule) ou à la main en admin.
   */
  async detectAll(accountId: string): Promise<number> {
    let created = 0;
    // 1) LATE_PAYER : locataires avec > 2 échéances OVERDUE sur 3 mois.
    const late = await this.prisma.charge.groupBy({
      by: ['occupancyId'],
      where: {
        accountId,
        type: 'LOYER',
        status: 'OVERDUE',
        dueDate: { gte: new Date(Date.now() - 90 * 86400000) },
      },
      _count: { _all: true },
    });
    for (const row of late.filter((r) => r._count._all > 2)) {
      const occ = await this.prisma.occupancy.findUnique({
        where: { id: row.occupancyId },
        include: { tenant: { select: { name: true, id: true } }, unit: { select: { code: true, siteId: true } } },
      });
      if (!occ) continue;
      await this.prisma.anomaly.create({
        data: {
          accountId,
          siteId: occ.unit.siteId,
          kind: 'LATE_PAYER',
          severity: 2,
          message: `Locataire ${occ.tenant.name} (${occ.unit.code}) : ${row._count._all} impayés sur 90 jours`,
          context: { tenantId: occ.tenant.id, occupancyId: occ.id, lateCount: row._count._all },
        },
      });
      created++;
    }
    // 2) VACANCY_LONG : unités libres depuis plus de 60 jours.
    const emptyUnits = await this.prisma.unit.findMany({
      where: { accountId, manualStatus: 'AVAILABLE', occupancies: { none: { status: { in: ['ACTIVE', 'NOTICE'] } } } },
      include: { site: { select: { id: true, name: true } }, occupancies: { orderBy: { actualEndDate: 'desc' }, take: 1 } },
    });
    for (const u of emptyUnits) {
      const last = u.occupancies[0]?.actualEndDate;
      const days = last ? Math.floor((Date.now() - last.getTime()) / 86400000) : null;
      if (days !== null && days > 60) {
        await this.prisma.anomaly.create({
          data: {
            accountId,
            siteId: u.site.id,
            kind: 'VACANCY_LONG',
            severity: 1,
            message: `Chambre ${u.code} (${u.site.name}) libre depuis ${days} jours`,
            context: { unitId: u.id, days },
          },
        });
        created++;
      }
    }
    return created;
  }
}
