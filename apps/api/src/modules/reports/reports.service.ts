import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  addMonths,
  diffDays,
  utcDate,
  type ArrearsQuery,
  type DashboardQuery,
} from '@citegest/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SiteAccessService } from '../../common/tenancy/site-access.service';
import type { RequestContext } from '../../common/tenancy/request-context';

interface MonthRange {
  start: Date;
  end: Date; // exclusif (1er du mois suivant)
  label: string;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: SiteAccessService,
  ) {}

  /** Indicateurs du mois : attendu, encaissé, reste, recouvrement, occupation, top impayés… */
  async dashboard(ctx: RequestContext, query: DashboardQuery) {
    const scope = await this.scopeSiteIds(ctx, query.siteId);
    const occWhere = this.occupancyScope(scope);
    const month = this.monthRange(query.month);
    const inMonth = { gte: month.start, lt: month.end };

    // Attendu : échéances (hors annulées) dont l'échéance tombe dans le mois.
    const expectedAgg = await this.prisma.charge.aggregate({
      where: { status: { not: 'CANCELLED' }, dueDate: inMonth, occupancy: occWhere },
      _sum: { amount: true },
    });
    const expected = expectedAgg._sum.amount ?? 0;

    // Encaissé : paiements valides du mois.
    const collectedAgg = await this.prisma.payment.aggregate({
      where: { status: 'VALID', paidAt: inMonth, occupancy: occWhere },
      _sum: { amount: true },
    });
    const collected = collectedAgg._sum.amount ?? 0;

    // Payé sur les échéances du mois (pour reste & recouvrement).
    const monthCharges = await this.prisma.charge.findMany({
      where: { status: { not: 'CANCELLED' }, dueDate: inMonth, occupancy: occWhere },
      select: { id: true },
    });
    const paidOnMonth = await this.sumAllocations(monthCharges.map((c) => c.id));
    const remaining = Math.max(expected - paidOnMonth, 0);
    const recoveryRate = expected > 0 ? Math.round((paidOnMonth / expected) * 100) : 0;

    // Taux d'occupation.
    const unitCount = await this.prisma.unit.count({
      where: scope ? { siteId: { in: scope } } : {},
    });
    const activeOcc = await this.prisma.occupancy.count({
      where: {
        status: { in: ['ACTIVE', 'NOTICE'] },
        ...(occWhere.unit ? { unit: occWhere.unit } : {}),
      },
    });
    const occupancyRate = unitCount > 0 ? Math.round((activeOcc / unitCount) * 100) : 0;

    // Encaissements par mode.
    const byModeRaw = await this.prisma.payment.groupBy({
      by: ['mode'],
      where: { status: 'VALID', paidAt: inMonth, occupancy: occWhere },
      _sum: { amount: true },
    });
    const byMode = byModeRaw.map((r) => ({ mode: r.mode, amount: r._sum.amount ?? 0 }));

    // Encaissements par encaisseur.
    const byCollectorRaw = await this.prisma.payment.groupBy({
      by: ['receivedBy'],
      where: { status: 'VALID', paidAt: inMonth, occupancy: occWhere },
      _sum: { amount: true },
    });
    const collectors = await this.prisma.user.findMany({
      where: { id: { in: byCollectorRaw.map((r) => r.receivedBy) } },
      select: { id: true, name: true },
    });
    const collectorName = new Map(collectors.map((u) => [u.id, u.name]));
    const byCollector = byCollectorRaw.map((r) => ({
      collectorId: r.receivedBy,
      name: collectorName.get(r.receivedBy) ?? '—',
      amount: r._sum.amount ?? 0,
    }));

    // Recettes − dépenses par site.
    const perSite = await this.incomeMinusExpensesBySite(scope, inMonth);

    const topArrears = (await this.arrears(ctx, { siteId: query.siteId, sort: 'amount' })).slice(
      0,
      5,
    );

    return {
      month: month.label,
      expected,
      collected,
      remaining,
      recoveryRate,
      occupancyRate,
      unitCount,
      activeOccupancies: activeOcc,
      byMode,
      byCollector,
      perSite,
      topArrears,
    };
  }

  /** Impayés (échéances échues non réglées) triés par ancienneté ou montant. */
  async arrears(ctx: RequestContext, query: ArrearsQuery) {
    const scope = await this.scopeSiteIds(ctx, query.siteId);
    const today = new Date();
    const charges = await this.prisma.charge.findMany({
      where: {
        status: { not: 'CANCELLED' },
        dueDate: { lte: today },
        occupancy: this.occupancyScope(scope),
      },
      include: {
        allocations: { where: { payment: { status: 'VALID' } }, select: { amount: true } },
        occupancy: { include: { unit: true, tenant: true } },
      },
    });

    const rows = charges
      .map((c) => {
        const paid = c.allocations.reduce((s, a) => s + a.amount, 0);
        const remaining = c.amount - paid;
        return {
          chargeId: c.id,
          tenantName: c.occupancy.tenant.name,
          tenantPhone: c.occupancy.tenant.phone,
          unitCode: c.occupancy.unit.code,
          type: c.type,
          dueDate: c.dueDate,
          daysLate: diffDays(c.dueDate, today),
          remaining,
        };
      })
      .filter((r) => r.remaining > 0);

    rows.sort((a, b) =>
      query.sort === 'amount' ? b.remaining - a.remaining : b.daysLate - a.daysLate,
    );
    return rows;
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private async scopeSiteIds(ctx: RequestContext, siteId?: string): Promise<string[] | null> {
    const ids = await this.access.accessibleSiteIds(ctx);
    if (siteId) {
      if (ids !== 'ALL') await this.access.assertSiteAccess(ctx, siteId);
      return [siteId];
    }
    return ids === 'ALL' ? null : ids;
  }

  private occupancyScope(scope: string[] | null): Prisma.OccupancyWhereInput {
    return scope ? { unit: { siteId: { in: scope } } } : {};
  }

  private monthRange(month?: string): MonthRange {
    const now = new Date();
    let year = now.getUTCFullYear();
    let m = now.getUTCMonth() + 1;
    if (month) {
      const [y, mm] = month.split('-').map(Number);
      year = y!;
      m = mm!;
    }
    const start = utcDate(year, m, 1);
    const next = addMonths({ year, month: m }, 1);
    const end = utcDate(next.year, next.month, 1);
    return { start, end, label: `${year}-${String(m).padStart(2, '0')}` };
  }

  private async sumAllocations(chargeIds: string[]): Promise<number> {
    if (chargeIds.length === 0) return 0;
    const agg = await this.prisma.allocation.aggregate({
      where: { chargeId: { in: chargeIds }, payment: { status: 'VALID' } },
      _sum: { amount: true },
    });
    return agg._sum.amount ?? 0;
  }

  private async incomeMinusExpensesBySite(
    scope: string[] | null,
    inMonth: { gte: Date; lt: Date },
  ) {
    const sites = await this.prisma.site.findMany({
      where: scope ? { id: { in: scope } } : {},
      select: { id: true, name: true },
    });
    const result = [];
    for (const site of sites) {
      const income = await this.prisma.payment.aggregate({
        where: { status: 'VALID', paidAt: inMonth, occupancy: { unit: { siteId: site.id } } },
        _sum: { amount: true },
      });
      const expense = await this.prisma.expense.aggregate({
        where: { spentAt: inMonth, siteId: site.id },
        _sum: { amount: true },
      });
      const recettes = income._sum.amount ?? 0;
      const depenses = expense._sum.amount ?? 0;
      result.push({
        siteId: site.id,
        name: site.name,
        recettes,
        depenses,
        net: recettes - depenses,
      });
    }
    return result;
  }
}
