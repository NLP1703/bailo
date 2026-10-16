import { Injectable } from '@nestjs/common';
import type { Charge, Prisma } from '@prisma/client';
import {
  computeChargeStatus,
  diffDays,
  type ChargeStatus,
  type OpenCharge,
} from '@bailo/shared';

export interface ChargeView {
  charge: Charge;
  paid: number;
  remaining: number;
  status: ChargeStatus;
}

export interface OccupancySummary {
  dueTotal: number; // Σ montants des échéances échues (hors annulées)
  paidTotal: number; // Σ allocations valides (hors caution ? non : toutes)
  balance: number; // dueTotal − paidTotal (RG : solde d'occupation)
  advanceAvailable: number; // Σ payé sur échéances futures non encore échues
  monthsCoveredUntil: string | null; // "YYYY-MM" du dernier loyer entièrement payé
  charges: ChargeView[];
}

/**
 * Calculs dérivés (non stockés) : payé/reste/statut par échéance, solde d'occupation,
 * avance disponible, mois couverts. « Payé » ne compte que les allocations de paiements VALID.
 */
@Injectable()
export class BalanceService {
  /** Somme des allocations valides par échéance (paiements VOIDED exclus, RG8). */
  async paidByCharge(
    tx: Prisma.TransactionClient,
    chargeIds: string[],
  ): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    if (chargeIds.length === 0) return map;
    const allocations = await tx.allocation.findMany({
      where: { chargeId: { in: chargeIds }, payment: { status: 'VALID' } },
      select: { chargeId: true, amount: true },
    });
    for (const a of allocations) {
      map.set(a.chargeId, (map.get(a.chargeId) ?? 0) + a.amount);
    }
    return map;
  }

  /** Échéances ouvertes (reste > 0, non annulées), triées du plus ancien au plus récent (RG5). */
  async openCharges(tx: Prisma.TransactionClient, occupancyId: string): Promise<OpenCharge[]> {
    const charges = await tx.charge.findMany({
      where: { occupancyId, status: { not: 'CANCELLED' } },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
    });
    const paid = await this.paidByCharge(
      tx,
      charges.map((c) => c.id),
    );
    const open: OpenCharge[] = [];
    for (const c of charges) {
      const remaining = c.amount - (paid.get(c.id) ?? 0);
      if (remaining > 0) open.push({ chargeId: c.id, remaining });
    }
    return open;
  }

  /** Vue complète des échéances d'une occupation avec statut calculé (RG7/RG10). */
  async chargeViews(
    tx: Prisma.TransactionClient,
    occupancyId: string,
    graceDays: number,
    today: Date,
  ): Promise<ChargeView[]> {
    const charges = await tx.charge.findMany({
      where: { occupancyId },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
    });
    const paidMap = await this.paidByCharge(
      tx,
      charges.map((c) => c.id),
    );
    return charges.map((charge) => {
      const paid = paidMap.get(charge.id) ?? 0;
      const status = computeChargeStatus({
        amount: charge.amount,
        paid,
        dueDate: charge.dueDate,
        today,
        graceDays,
        cancelled: charge.status === 'CANCELLED',
      });
      return { charge, paid, remaining: Math.max(charge.amount - paid, 0), status };
    });
  }

  /** Synthèse financière d'une occupation (solde, avance, mois couverts). */
  async summary(
    tx: Prisma.TransactionClient,
    occupancyId: string,
    graceDays: number,
    today: Date,
  ): Promise<OccupancySummary> {
    const views = await this.chargeViews(tx, occupancyId, graceDays, today);

    let dueTotal = 0;
    let paidTotal = 0;
    let advanceAvailable = 0;
    let monthsCoveredUntil: string | null = null;

    for (const v of views) {
      if (v.charge.status === 'CANCELLED') continue;
      paidTotal += v.paid;
      const isDue = diffDays(v.charge.dueDate, today) >= 0;
      if (isDue) {
        dueTotal += v.charge.amount;
      } else {
        advanceAvailable += v.paid; // payé d'avance sur une échéance non encore échue
      }
      // Mois couverts = dernier LOYER entièrement payé.
      if (
        v.charge.type === 'LOYER' &&
        v.remaining === 0 &&
        v.charge.periodYear &&
        v.charge.periodMonth
      ) {
        const label = `${v.charge.periodYear}-${String(v.charge.periodMonth).padStart(2, '0')}`;
        if (!monthsCoveredUntil || label > monthsCoveredUntil) monthsCoveredUntil = label;
      }
    }

    return {
      dueTotal,
      paidTotal,
      balance: dueTotal - paidTotal,
      advanceAvailable,
      monthsCoveredUntil,
      charges: views,
    };
  }
}
