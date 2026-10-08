// RG15 : clôture d'une occupation.
//   caution versée − impayés − retenues motivées = à rembourser (ou reste dû si négatif).

export interface Retenue {
  amount: number;
  reason: string; // motif obligatoire
}

export interface CloseoutInput {
  /** Caution réellement encaissée (Σ allocations sur l'échéance de caution). */
  depositPaid: number;
  /** Impayés hors caution (Σ restes des échéances non annulées, hors caution). */
  unpaidTotal: number;
  retenues: Retenue[];
}

export interface CloseoutResult {
  depositPaid: number;
  unpaidTotal: number;
  retenuesTotal: number;
  /** > 0 : à rembourser au locataire ; < 0 : reste dû par le locataire. */
  refund: number;
}

export function computeCloseout(input: CloseoutInput): CloseoutResult {
  for (const r of input.retenues) {
    if (r.amount <= 0) throw new Error('Une retenue doit être positive');
    if (!r.reason || !r.reason.trim()) throw new Error('Motif de retenue obligatoire');
  }
  const retenuesTotal = input.retenues.reduce((sum, r) => sum + r.amount, 0);
  const refund = input.depositPaid - input.unpaidTotal - retenuesTotal;
  return {
    depositPaid: input.depositPaid,
    unpaidTotal: input.unpaidTotal,
    retenuesTotal,
    refund,
  };
}
