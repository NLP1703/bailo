// RG7 & RG10 : statut « vivant » d'une échéance.
//
// RG7  — payée si Σ allocations = montant ; partielle si inférieure.
// RG10 — « en retard » le lendemain de la date d'échéance, après le délai de grâce du site.

import type { ChargeStatus } from '../enums';
import { diffDays } from './dates';

export interface ChargeStatusInput {
  amount: number;
  paid: number; // Σ allocations valides
  dueDate: Date;
  today: Date;
  graceDays: number;
  cancelled: boolean;
}

/**
 * Statut calculé d'une échéance (non stocké tel quel : recalculé à la demande,
 * ou matérialisé par un job de bascule). Priorités :
 *   annulée > payée > en retard > partielle > due > à venir.
 */
export function computeChargeStatus(input: ChargeStatusInput): ChargeStatus {
  if (input.cancelled) return 'CANCELLED';
  if (input.paid >= input.amount) return 'PAID';

  // En retard : aujourd'hui strictement après (dueDate + graceDays) (RG10).
  const daysPastDue = diffDays(input.dueDate, input.today);
  if (daysPastDue > input.graceDays) return 'OVERDUE';

  if (input.paid > 0) return 'PARTIAL';
  if (daysPastDue >= 0) return 'DUE';
  return 'UPCOMING';
}
