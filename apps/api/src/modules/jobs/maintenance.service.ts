import { Injectable, Logger } from '@nestjs/common';
import {
  computeChargeStatus,
  computePenalty,
  generateRentSchedule,
  utcDate,
  yearMonthOf,
  addMonths,
} from '@bailo/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RemindersService } from '../reminders/reminders.service';

/**
 * Maintenance quotidienne (système, hors contexte compte — toutes les données).
 *  1. Rafraîchit le statut stocké des échéances (bascule « en retard », RG10).
 *  2. Génère les relances du jour (RG11–RG13).
 *  3. Prolonge automatiquement les échéances des occupations sans fin prévue (RG1).
 */
@Injectable()
export class MaintenanceService {
  private readonly logger = new Logger('Maintenance');

  constructor(
    private readonly prisma: PrismaService,
    private readonly reminders: RemindersService,
  ) {}

  async run(
    today = new Date(),
  ): Promise<{
    statusUpdates: number;
    penalties: number;
    reminders: number;
    extended: number;
    reservationsExpired: number;
  }> {
    const statusUpdates = await this.refreshChargeStatuses(today);
    const penalties = await this.generatePenalties(today);
    const reminders = await this.reminders.generateForDate(this.prisma, today);
    const extended = await this.extendSchedules(today);
    const reservationsExpired = await this.expireReservations(today);
    this.logger.log(
      `Maintenance: ${statusUpdates} statuts, ${penalties} pénalités, ${reminders} relances, ${extended} échéances prolongées, ${reservationsExpired} réservations expirées`,
    );
    return { statusUpdates, penalties, reminders, extended, reservationsExpired };
  }

  /**
   * Expire les réservations arrivées à échéance (RG18 bleu → gris automatique).
   * Toute unité RESERVED dont `reservedUntil` est <= aujourd'hui est rebasculée en
   * AVAILABLE : la case redevient grise, prête à passer en vert dès que le
   * propriétaire crée l'occupation réelle du locataire qui vient d'arriver.
   */
  async expireReservations(today: Date): Promise<number> {
    const result = await this.prisma.unit.updateMany({
      where: {
        manualStatus: 'RESERVED',
        reservedUntil: { lte: today },
      },
      data: { manualStatus: 'AVAILABLE', reservedUntil: null, reservedFor: null },
    });
    return result.count;
  }

  /**
   * Pénalités de retard (F5.6) : pour chaque site l'ayant activée, crée une
   * échéance PENALITE sur les loyers en retard au-delà du délai de grâce, sans
   * doublon (une pénalité par échéance d'origine via `penaltyForChargeId`).
   */
  async generatePenalties(today: Date): Promise<number> {
    const sites = await this.prisma.site.findMany({
      where: { penaltyEnabled: true, penaltyValue: { gt: 0 } },
    });
    let created = 0;
    for (const site of sites) {
      const cutoff = new Date(today.getTime() - site.penaltyGraceDays * 86_400_000);
      const charges = await this.prisma.charge.findMany({
        where: {
          type: 'LOYER',
          status: { notIn: ['CANCELLED', 'PAID'] },
          dueDate: { lt: cutoff },
          occupancy: { unit: { siteId: site.id } },
        },
        include: {
          allocations: { where: { payment: { status: 'VALID' } }, select: { amount: true } },
        },
      });
      for (const c of charges) {
        const paid = c.allocations.reduce((s, a) => s + a.amount, 0);
        const remaining = c.amount - paid;
        if (remaining <= 0) continue;
        const amount = computePenalty(site.penaltyMode, site.penaltyValue, remaining);
        if (amount <= 0) continue;
        const already = await this.prisma.charge.findUnique({
          where: { penaltyForChargeId: c.id },
        });
        if (already) continue;
        await this.prisma.charge.create({
          data: {
            accountId: c.accountId,
            occupancyId: c.occupancyId,
            type: 'PENALITE',
            amount,
            dueDate: today,
            status: 'DUE',
            penaltyForChargeId: c.id,
          },
        });
        created += 1;
      }
    }
    return created;
  }

  /** Recalcule et persiste le statut des échéances non réglées (RG7/RG10). */
  async refreshChargeStatuses(today: Date): Promise<number> {
    const charges = await this.prisma.charge.findMany({
      where: { status: { notIn: ['CANCELLED', 'PAID'] } },
      include: {
        allocations: { where: { payment: { status: 'VALID' } }, select: { amount: true } },
        occupancy: { include: { unit: { include: { site: true } } } },
      },
    });
    let updated = 0;
    for (const charge of charges) {
      const paid = charge.allocations.reduce((s, a) => s + a.amount, 0);
      const status = computeChargeStatus({
        amount: charge.amount,
        paid,
        dueDate: charge.dueDate,
        today,
        graceDays: charge.occupancy.unit.site.graceDays,
        cancelled: false,
      });
      if (status !== charge.status) {
        await this.prisma.charge.update({ where: { id: charge.id }, data: { status } });
        updated += 1;
      }
    }
    return updated;
  }

  /** Prolonge les occupations sans fin prévue dont la couverture expire sous 60 jours (RG1). */
  async extendSchedules(today: Date): Promise<number> {
    const horizon = new Date(today.getTime() + 60 * 86_400_000);
    const occupancies = await this.prisma.occupancy.findMany({
      where: {
        status: { in: ['ACTIVE', 'NOTICE'] },
        plannedEndDate: null,
        chargesGeneratedUntil: { lt: horizon },
      },
    });

    let extended = 0;
    for (const occ of occupancies) {
      if (!occ.chargesGeneratedUntil) continue;
      // Premier mois non couvert = mois suivant la borne générée.
      const next = addMonths(yearMonthOf(occ.chargesGeneratedUntil), 1);
      const startDate = utcDate(next.year, next.month, 1);
      const schedule = generateRentSchedule({
        startDate,
        plannedEndDate: null,
        monthlyRent: occ.monthlyRent,
        dueDay: occ.dueDay,
        prorataFirstMonth: false, // mois pleins en continuation
        horizonMonths: 12,
      });
      for (const rc of schedule.charges) {
        await this.prisma.charge.upsert({
          where: {
            occupancyId_type_periodYear_periodMonth: {
              occupancyId: occ.id,
              type: 'LOYER',
              periodYear: rc.periodYear,
              periodMonth: rc.periodMonth,
            },
          },
          create: {
            accountId: occ.accountId,
            occupancyId: occ.id,
            type: 'LOYER',
            periodYear: rc.periodYear,
            periodMonth: rc.periodMonth,
            amount: rc.amount,
            dueDate: rc.dueDate,
            status: 'UPCOMING',
          },
          update: {}, // ne jamais réécrire un montant figé (RG2)
        });
      }
      await this.prisma.occupancy.update({
        where: { id: occ.id },
        data: { chargesGeneratedUntil: schedule.generatedUntil },
      });
      extended += 1;
    }
    return extended;
  }
}
