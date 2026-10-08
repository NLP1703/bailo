// RG1–RG4 : génération des échéances de loyer d'une occupation.
//
// RG1 — une échéance de loyer par mois, de la date d'entrée à la fin prévue ;
//       sans fin, `horizonMonths` mois (12 par défaut), prolongés ensuite.
// RG2 — le montant est figé à la création (ce module ne fait que le calculer).
// RG3 — jour d'échéance paramétrable, ramené au 28 si besoin (cf. effectiveDueDay).
// RG4 — mois d'entrée incomplet : plein ou au prorata selon le réglage du site.

import {
  addMonths,
  compareYearMonth,
  daysInMonth,
  effectiveDueDay,
  utcDate,
  yearMonthOf,
  type YearMonth,
} from './dates';

export interface RentScheduleInput {
  startDate: Date;
  plannedEndDate: Date | null;
  monthlyRent: number;
  dueDay: number;
  /** true si le site facture le 1er mois incomplet au prorata (RG4). */
  prorataFirstMonth: boolean;
  /** Horizon quand il n'y a pas de fin prévue (RG1). */
  horizonMonths?: number;
}

export interface ScheduledCharge {
  periodYear: number;
  periodMonth: number;
  amount: number;
  dueDate: Date;
}

export interface RentSchedule {
  charges: ScheduledCharge[];
  /** Dernier jour couvert : borne de génération (occupancy.chargesGeneratedUntil). */
  generatedUntil: Date;
}

/** Montant du 1er mois si prorata : loyer × jours occupés / jours du mois (RG4, arrondi entier RG22). */
export function prorataFirstMonthAmount(startDate: Date, monthlyRent: number): number {
  const { year, month } = yearMonthOf(startDate);
  const dim = daysInMonth(year, month);
  const occupiedDays = dim - startDate.getUTCDate() + 1;
  return Math.round((monthlyRent * occupiedDays) / dim);
}

/**
 * Génère la liste des échéances de loyer (une par mois couvert).
 * Le mois de fin (mois de `plannedEndDate`) est inclus et facturé plein.
 */
export function generateRentSchedule(input: RentScheduleInput): RentSchedule {
  const { startDate, plannedEndDate, monthlyRent, dueDay, prorataFirstMonth } = input;
  const horizon = input.horizonMonths ?? 12;

  const first = yearMonthOf(startDate);
  const last: YearMonth = plannedEndDate
    ? yearMonthOf(plannedEndDate)
    : addMonths(first, horizon - 1);

  const charges: ScheduledCharge[] = [];
  let cursor = first;
  let isFirst = true;
  while (compareYearMonth(cursor, last) <= 0) {
    const amount =
      isFirst && prorataFirstMonth ? prorataFirstMonthAmount(startDate, monthlyRent) : monthlyRent;
    const day = effectiveDueDay(dueDay, cursor.year, cursor.month);
    charges.push({
      periodYear: cursor.year,
      periodMonth: cursor.month,
      amount,
      dueDate: utcDate(cursor.year, cursor.month, day),
    });
    cursor = addMonths(cursor, 1);
    isFirst = false;
  }

  const generatedUntil = utcDate(last.year, last.month, daysInMonth(last.year, last.month));
  return { charges, generatedUntil };
}

/**
 * Somme des loyers couvrant les mois jusqu'à `until` inclus — montant du paiement
 * d'ouverture pour un locataire « déjà payé jusqu'au mois de… » (import, P1).
 */
export function rentCoveredAmount(charges: ScheduledCharge[], until: YearMonth): number {
  return charges
    .filter((c) => compareYearMonth({ year: c.periodYear, month: c.periodMonth }, until) <= 0)
    .reduce((sum, c) => sum + c.amount, 0);
}
