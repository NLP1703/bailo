import { z } from 'zod';
import { uuid } from './common';
import { fcfa, fcfaPositive } from '../money';

/** Date ISO (JJ/MM/AAAA côté UI, ISO sur le fil). */
const isoDate = z.string().datetime({ offset: true }).or(z.string().date());

/** Avance versée à l'entrée : en nombre de mois OU en montant (RG6 → échéances futures). */
const advance = z
  .object({
    months: z.number().int().min(0).optional(),
    amount: fcfa.optional(),
  })
  .refine((v) => !(v.months !== undefined && v.amount !== undefined), {
    message: 'Préciser soit le nombre de mois, soit un montant, pas les deux',
  });

export const createOccupancyDto = z.object({
  unitId: uuid,
  tenantId: uuid,
  startDate: isoDate,
  plannedEndDate: isoDate.optional(),
  monthlyRent: fcfaPositive,
  dueDay: z.number().int().min(1).max(28),
  deposit: fcfa.default(0),
  /** Mode de paiement de l'avance/caution encaissée à l'entrée (si > 0). */
  advance: advance.optional(),
  paymentMode: z
    .enum(['ESPECES', 'MTN_MOMO', 'ORANGE_MONEY', 'VIREMENT', 'AUTRE'])
    .default('ESPECES'),
  clientId: uuid.optional(), // idempotence du paiement d'ouverture (hors-ligne)
});
export type CreateOccupancyDto = z.infer<typeof createOccupancyDto>;

export const noticeOccupancyDto = z.object({
  noticeDate: isoDate,
});
export type NoticeOccupancyDto = z.infer<typeof noticeOccupancyDto>;

export const retenueDto = z.object({
  amount: fcfaPositive,
  reason: z.string().min(2), // motif obligatoire (RG15)
});
export type RetenueDto = z.infer<typeof retenueDto>;

export const closeOccupancyDto = z.object({
  actualEndDate: isoDate,
  retenues: z.array(retenueDto).default([]),
});
export type CloseOccupancyDto = z.infer<typeof closeOccupancyDto>;
