import type { ChargeType } from '@bailo/shared';
import { monthLabel } from './format';

const CHARGE_TYPE_LABELS: Record<ChargeType, string> = {
  LOYER: 'Loyer',
  CAUTION: 'Caution',
  EAU: 'Eau',
  ELECTRICITE: 'Électricité',
  FRAIS: 'Frais',
  PENALITE: 'Pénalité de retard',
  REPARATION: 'Réparation',
};

/** « Loyer août 2026 », « Caution », « Eau oct. 2026 »… */
export function chargeLabel(charge: {
  type: ChargeType;
  periodMonth: number | null;
  periodYear: number | null;
  dueDate: string;
}): string {
  const base = CHARGE_TYPE_LABELS[charge.type] ?? charge.type;
  if (charge.periodMonth && charge.periodYear) {
    return `${base} ${monthLabel(charge.periodMonth, charge.periodYear)}`;
  }
  if (charge.type === 'EAU' || charge.type === 'ELECTRICITE') {
    const d = new Date(charge.dueDate);
    return `${base} ${monthLabel(d.getMonth() + 1, d.getFullYear())}`;
  }
  return base;
}
