import type { PenaltyMode } from '../enums';

/**
 * Montant d'une pénalité de retard (F5.6) : montant fixe, ou pourcentage du
 * reste dû (arrondi à l'entier FCFA, RG22). Zéro si paramètres ou reste nuls.
 */
export function computePenalty(mode: PenaltyMode, value: number, remaining: number): number {
  if (value <= 0 || remaining <= 0) return 0;
  return mode === 'PERCENT' ? Math.round((remaining * value) / 100) : value;
}
