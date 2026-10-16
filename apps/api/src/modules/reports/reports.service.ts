import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  addMonths,
  diffDays,
  utcDate,
  type ArrearsQuery,
  type DashboardQuery,
} from '@bailo/shared';
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

    // Montant brut théoriquement dû dans le mois (toutes charges hors annulées).
    const monthCharges = await this.prisma.charge.findMany({
      where: { status: { not: 'CANCELLED' }, dueDate: inMonth, occupancy: occWhere },
      select: { id: true, amount: true },
    });
    const monthChargeIds = monthCharges.map((c) => c.id);
    const expectedGross = monthCharges.reduce((s, c) => s + c.amount, 0);

    // Allocations déjà appliquées sur ces charges par des paiements ANTÉRIEURS au mois.
    // → c'est la part « avance » : un locataire qui a payé 6 mois d'avance couvre déjà
    //   le loyer de ces mois, qui ne doivent donc PLUS figurer dans l'attendu courant.
    const coveredByAdvance =
      monthChargeIds.length === 0
        ? 0
        : (
            await this.prisma.allocation.aggregate({
              where: {
                chargeId: { in: monthChargeIds },
                payment: { status: 'VALID', paidAt: { lt: month.start } },
              },
              _sum: { amount: true },
            })
          )._sum.amount ?? 0;

    // Encaissé : paiements valides du mois (brut, tous flux confondus).
    const collectedAgg = await this.prisma.payment.aggregate({
      where: { status: 'VALID', paidAt: inMonth, occupancy: occWhere },
      _sum: { amount: true },
    });
    const collected = collectedAgg._sum.amount ?? 0;

    // Payé sur les échéances du mois (toutes allocations : avances + encaissement du mois).
    const paidOnMonth = await this.sumAllocations(monthChargeIds);

    // Attendu « net » affiché : UNIQUEMENT ce qui reste à encaisser.
    // → chaque paiement (avance antérieure OU paiement du mois) se déduit automatiquement.
    //   Si un locataire a versé 6 mois, chacun de ces mois disparaît de l'attendu.
    //   Dès qu'un paiement du mois arrive, il descend aussi l'attendu en temps réel.
    const expected = Math.max(expectedGross - paidOnMonth, 0);
    const remaining = expected; // alias historique (certains clients lisent encore remaining)
    const recoveryRate =
      expectedGross > 0 ? Math.round((paidOnMonth / expectedGross) * 100) : 0;

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

    // Recettes par site.
    const perSite = await this.incomeBySite(scope, inMonth);

    const topArrears = (await this.arrears(ctx, { siteId: query.siteId, sort: 'amount' })).slice(
      0,
      5,
    );

    // Liste des locataires actifs avec ce qu'ils ont déjà payé + prochaine échéance.
    // Si un locataire a payé plusieurs mois d'avance, on n'affiche que la PROCHAINE
    // date d'échéance non réglée (et non toutes les mensualités couvertes).
    const tenantPayments = await this.tenantPaymentsList(scope);

    // Historique des encaissements sur 6 mois (mois courant inclus) : alimente le
    // graphique du tableau de bord et la tendance « vs mois précédent ».
    const history = await this.collectionsHistory(occWhere, month, 6);
    const previousCollected = history.length >= 2 ? history[history.length - 2]!.collected : 0;

    return {
      month: month.label,
      expected,          // reste à encaisser (avances + paiements du mois déjà retirés)
      expectedGross,     // brut théorique du mois (pour l'historique / stats)
      coveredByAdvance,  // part du mois couverte par des avances antérieures (info seule)
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
      tenantPayments,
      history,
      previousCollected,
    };
  }

  /** Encaissements valides mois par mois, du plus ancien au plus récent. */
  private async collectionsHistory(
    occWhere: Prisma.OccupancyWhereInput,
    current: MonthRange,
    count: number,
  ): Promise<{ month: string; collected: number }[]> {
    const [y, m] = current.label.split('-').map(Number);
    const ranges: MonthRange[] = [];
    for (let i = count - 1; i >= 0; i -= 1) {
      const d = addMonths({ year: y!, month: m! }, -i);
      ranges.push(this.monthRange(`${d.year}-${String(d.month).padStart(2, '0')}`));
    }
    return Promise.all(
      ranges.map(async (r) => {
        const agg = await this.prisma.payment.aggregate({
          where: { status: 'VALID', paidAt: { gte: r.start, lt: r.end }, occupancy: occWhere },
          _sum: { amount: true },
        });
        return { month: r.label, collected: agg._sum.amount ?? 0 };
      }),
    );
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
        occupancy: {
          include: { unit: { include: { site: { select: { name: true } } } }, tenant: true },
        },
      },
    });

    const rows = charges
      .map((c) => {
        const paid = c.allocations.reduce((s, a) => s + a.amount, 0);
        const remaining = c.amount - paid;
        return {
          chargeId: c.id,
          tenantId: c.occupancy.tenantId,
          tenantName: c.occupancy.tenant.name,
          tenantPhone: c.occupancy.tenant.phone,
          unitCode: c.occupancy.unit.code,
          siteName: c.occupancy.unit.site.name,
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

  /**
   * Liste des locataires actifs avec ce qu'ils ont déjà payé en cumul, et leur
   * prochaine échéance non réglée. Un locataire qui a payé 6 mois d'avance
   * n'apparaît ici qu'avec UNE seule date : la toute prochaine échéance restante.
   */
  private async tenantPaymentsList(scope: string[] | null) {
    const occupancies = await this.prisma.occupancy.findMany({
      where: {
        status: { in: ['ACTIVE', 'NOTICE'] },
        ...(scope ? { unit: { siteId: { in: scope } } } : {}),
      },
      include: {
        tenant: { select: { name: true } },
        unit: { select: { code: true, site: { select: { name: true } } } },
        payments: {
          where: { status: 'VALID' },
          select: { amount: true },
        },
        charges: {
          where: { status: { not: 'CANCELLED' } },
          include: {
            allocations: {
              where: { payment: { status: 'VALID' } },
              select: { amount: true },
            },
          },
        },
      },
      orderBy: [{ unit: { code: 'asc' } }],
    });

    return occupancies.map((o) => {
      const totalPaid = o.payments.reduce((s, p) => s + p.amount, 0);
      // Première charge non entièrement couverte → prochaine date due.
      let nextDueDate: Date | null = null;
      let nextDueAmount = 0;
      for (const c of o.charges) {
        const paid = c.allocations.reduce((s, a) => s + a.amount, 0);
        const remaining = c.amount - paid;
        if (remaining <= 0) continue; // mois déjà couvert (avance ou paiement du mois)
        if (!nextDueDate || c.dueDate < nextDueDate) {
          nextDueDate = c.dueDate;
          nextDueAmount = remaining;
        }
      }
      return {
        occupancyId: o.id,
        tenantName: o.tenant.name,
        unitCode: o.unit.code,
        siteName: o.unit.site.name,
        totalPaid,
        nextDueDate: nextDueDate ? nextDueDate.toISOString() : null,
        nextDueAmount: nextDueDate ? nextDueAmount : null,
      };
    });
  }

  private async incomeBySite(
    scope: string[] | null,
    inMonth: { gte: Date; lt: Date },
  ) {
    const sites = await this.prisma.site.findMany({
      where: scope ? { id: { in: scope } } : {},
      select: { id: true, name: true },
    });
    return Promise.all(
      sites.map(async (site) => {
        const [income, units, occupied] = await Promise.all([
          this.prisma.payment.aggregate({
            where: { status: 'VALID', paidAt: inMonth, occupancy: { unit: { siteId: site.id } } },
            _sum: { amount: true },
          }),
          this.prisma.unit.count({ where: { siteId: site.id } }),
          this.prisma.occupancy.count({
            where: { status: { in: ['ACTIVE', 'NOTICE'] }, unit: { siteId: site.id } },
          }),
        ]);
        return {
          siteId: site.id,
          name: site.name,
          recettes: income._sum.amount ?? 0,
          units,
          occupied,
          occupancyRate: units > 0 ? Math.round((occupied / units) * 100) : 0,
        };
      }),
    );
  }
}
