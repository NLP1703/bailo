// Montants en FCFA (XAF) : entiers, sans décimales (RG22).

import { z } from 'zod';

/** Un montant FCFA valide : entier >= 0. */
export const fcfa = z.number().int().min(0);

/** Un montant FCFA strictement positif (paiement, loyer…). */
export const fcfaPositive = z.number().int().min(1);

/** Formatage lisible : 175000 -> "175 000 FCFA" (espace insécable fine comme séparateur). */
export function formatFcfa(amount: number): string {
  const grouped = Math.trunc(amount)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${grouped} FCFA`;
}
