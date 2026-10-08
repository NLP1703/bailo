import { z } from 'zod';
import { uuid } from './common';
import { fcfa } from '../money';

const isoDate = z.string().datetime({ offset: true }).or(z.string().date());

export const cashQuery = z.object({
  collectorId: uuid.optional(), // le gardien est forcé sur lui-même côté serveur
  from: isoDate.optional(),
  to: isoDate.optional(),
});
export type CashQuery = z.infer<typeof cashQuery>;

export const createHandoverDto = z.object({
  collectorId: uuid,
  periodStart: isoDate,
  periodEnd: isoDate,
  handedAmount: fcfa,
  note: z.string().max(240).optional(),
});
export type CreateHandoverDto = z.infer<typeof createHandoverDto>;
