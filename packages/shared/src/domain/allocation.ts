// RG5–RG7 : affectation d'un paiement aux échéances.
//
// RG5 — affectation aux échéances ouvertes, de la plus ancienne à la plus récente.
// RG6 — l'excédent va aux échéances futures (avance) ; au-delà de la dernière échéance
//       (fin d'occupation), il reste non affecté (pas de « crédit flottant »).
// RG7 — une échéance est « payée » si Σ allocations = montant, « partielle » si inférieure.
//
// Ce module est pur : il reçoit les échéances ouvertes déjà triées (RG5) et le montant,
// et renvoie les lignes d'allocation. La persistance et le tri viennent du service.

export interface OpenCharge {
  chargeId: string;
  /** Reste à payer sur l'échéance (montant − déjà affecté), > 0. */
  remaining: number;
}

export interface AllocationLine {
  chargeId: string;
  amount: number;
}

export interface AllocationResult {
  lines: AllocationLine[];
  /** Montant non affecté (sur-paiement au-delà de la dernière échéance). */
  leftover: number;
}

/**
 * Affectation automatique FIFO (RG5/RG6). `openCharges` doit être trié du plus
 * ancien au plus récent (échéances courantes puis futures).
 */
export function allocateFifo(amount: number, openCharges: OpenCharge[]): AllocationResult {
  let remaining = amount;
  const lines: AllocationLine[] = [];
  for (const charge of openCharges) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, charge.remaining);
    if (take > 0) {
      lines.push({ chargeId: charge.chargeId, amount: take });
      remaining -= take;
    }
  }
  return { lines, leftover: remaining };
}

/**
 * Valide une affectation manuelle (choix explicite de l'encaisseur).
 * Chaque ligne doit être > 0, ≤ reste de l'échéance, et la somme ≤ montant du paiement.
 */
export function validateManualAllocation(
  amount: number,
  lines: AllocationLine[],
  remainingByCharge: ReadonlyMap<string, number>,
): void {
  let total = 0;
  const seen = new Set<string>();
  for (const line of lines) {
    if (seen.has(line.chargeId)) {
      throw new Error(`Échéance en double dans l'affectation: ${line.chargeId}`);
    }
    seen.add(line.chargeId);
    if (line.amount <= 0) {
      throw new Error('Chaque montant affecté doit être positif');
    }
    const remaining = remainingByCharge.get(line.chargeId);
    if (remaining === undefined) {
      throw new Error(`Échéance inconnue ou déjà réglée: ${line.chargeId}`);
    }
    if (line.amount > remaining) {
      throw new Error(
        `Montant affecté (${line.amount}) supérieur au reste dû (${remaining}) sur ${line.chargeId}`,
      );
    }
    total += line.amount;
  }
  if (total > amount) {
    throw new Error(`Somme des affectations (${total}) supérieure au paiement (${amount})`);
  }
}
