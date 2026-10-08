import { Injectable, Logger } from '@nestjs/common';
import {
  computeChargeStatus,
  generateRentSchedule,
  utcDate,
  yearMonthOf,
  addMonths,
} from '@citegest/shared';
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
  ): Promise<{ statusUpdates: number; reminders: number; extended: number }> {
    const statusUpdates = await this.refreshChargeStatuses(today);
    const reminders = await this.reminders.generateForDate(this.prisma, today);
    const extended = await this.extendSchedules(today);
    this.logger.log(
      `Maintenance: ${statusUpdates} statuts, ${reminders} relances, ${extended} échéances prolongées`,
    );
    return { statusUpdates, reminders, extended };
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
