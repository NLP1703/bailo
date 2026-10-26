import { Injectable, Logger } from '@nestjs/common';
import {
  computeChargeStatus,
  computePenalty,
  generateRentSchedule,
  utcDate,
  yearMonthOf,
  addMonths,
  type ChargeStatus,
} from '@bailo/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RemindersService } from '../reminders/reminders.service';

/** Taille des lots lus par la maintenance (borne la mémoire sur les gros comptes). */
const MAINTENANCE_BATCH_SIZE = 1000;

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

  async run(today = new Date()): Promise<{
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
   *
   * Requêtes groupées : une lecture par site (les pénalités déjà créées sont
   * exclues dès la requête) puis une seule insertion `createMany` par site —
   * `skipDuplicates` s'appuie sur l'unicité de `penaltyForChargeId` pour rester
   * idempotent même si deux exécutions se chevauchent.
   */
  async generatePenalties(today: Date): Promise<number> {
    const sites = await this.prisma.site.findMany({
      where: { penaltyEnabled: true, penaltyValue: { gt: 0 } },
      select: { id: true, penaltyGraceDays: true, penaltyMode: true, penaltyValue: true },
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
        select: {
          id: true,
          accountId: true,
          occupancyId: true,
          amount: true,
          allocations: { where: { payment: { status: 'VALID' } }, select: { amount: true } },
        },
      });
      if (charges.length === 0) continue;

      const existing = await this.prisma.charge.findMany({
        where: { penaltyForChargeId: { in: charges.map((c) => c.id) } },
        select: { penaltyForChargeId: true },
      });
      const alreadyPenalised = new Set(existing.map((e) => e.penaltyForChargeId));

      const rows = [];
      for (const c of charges) {
        if (alreadyPenalised.has(c.id)) continue;
        const paid = c.allocations.reduce((s, a) => s + a.amount, 0);
        const remaining = c.amount - paid;
        if (remaining <= 0) continue;
        const amount = computePenalty(site.penaltyMode, site.penaltyValue, remaining);
        if (amount <= 0) continue;
        rows.push({
          accountId: c.accountId,
          occupancyId: c.occupancyId,
          type: 'PENALITE' as const,
          amount,
          dueDate: today,
          status: 'DUE' as const,
          penaltyForChargeId: c.id,
        });
      }
      if (rows.length === 0) continue;
      const result = await this.prisma.charge.createMany({ data: rows, skipDuplicates: true });
      created += result.count;
    }
    return created;
  }

  /**
   * Recalcule et persiste le statut des échéances non réglées (RG7/RG10).
   *
   * Parcours par lots (curseur sur l'id) pour borner la mémoire, et une seule
   * écriture `updateMany` par statut cible et par lot au lieu d'un UPDATE par ligne.
   */
  async refreshChargeStatuses(today: Date): Promise<number> {
    let updated = 0;
    let cursor: string | undefined;
    for (;;) {
      const batch = await this.prisma.charge.findMany({
        where: { status: { notIn: ['CANCELLED', 'PAID'] } },
        select: {
          id: true,
          amount: true,
          dueDate: true,
          status: true,
          allocations: { where: { payment: { status: 'VALID' } }, select: { amount: true } },
          occupancy: { select: { unit: { select: { site: { select: { graceDays: true } } } } } },
        },
        orderBy: { id: 'asc' },
        take: MAINTENANCE_BATCH_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (batch.length === 0) break;

      const idsByStatus = new Map<ChargeStatus, string[]>();
      for (const charge of batch) {
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
          const ids = idsByStatus.get(status) ?? [];
          ids.push(charge.id);
          idsByStatus.set(status, ids);
        }
      }
      for (const [status, ids] of idsByStatus) {
        const result = await this.prisma.charge.updateMany({
          where: { id: { in: ids } },
          data: { status },
        });
        updated += result.count;
      }

      if (batch.length < MAINTENANCE_BATCH_SIZE) break;
      cursor = batch[batch.length - 1]!.id;
    }
    return updated;
  }

  /**
   * Prolonge les occupations sans fin prévue dont la couverture expire sous 60 jours (RG1).
   *
   * Une insertion `createMany` par occupation (au lieu d'un upsert par mois) :
   * `skipDuplicates` respecte l'unicité (occupation, type, période) et ne réécrit
   * jamais un montant figé (RG2). L'insertion et la mise à jour de la borne
   * `chargesGeneratedUntil` sont atomiques.
   */
  async extendSchedules(today: Date): Promise<number> {
    const horizon = new Date(today.getTime() + 60 * 86_400_000);
    const occupancies = await this.prisma.occupancy.findMany({
      where: {
        status: { in: ['ACTIVE', 'NOTICE'] },
        plannedEndDate: null,
        chargesGeneratedUntil: { lt: horizon },
      },
      select: {
        id: true,
        accountId: true,
        monthlyRent: true,
        dueDay: true,
        chargesGeneratedUntil: true,
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
      await this.prisma.$transaction([
        this.prisma.charge.createMany({
          data: schedule.charges.map((rc) => ({
            accountId: occ.accountId,
            occupancyId: occ.id,
            type: 'LOYER' as const,
            periodYear: rc.periodYear,
            periodMonth: rc.periodMonth,
            amount: rc.amount,
            dueDate: rc.dueDate,
            status: 'UPCOMING' as const,
          })),
          skipDuplicates: true, // ne jamais réécrire un montant figé (RG2)
        }),
        this.prisma.occupancy.update({
          where: { id: occ.id },
          data: { chargesGeneratedUntil: schedule.generatedUntil },
        }),
      ]);
      extended += 1;
    }
    return extended;
  }
}
