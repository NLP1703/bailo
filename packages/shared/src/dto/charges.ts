import { z } from 'zod';
import { uuid } from './common';
import { fcfaPositive } from '../money';
import { CHARGE_TYPES } from '../enums';

const isoDate = z.string().datetime({ offset: true }).or(z.string().date());

// Échéance ponctuelle : caution, eau, électricité, frais, réparation (pas LOYER : généré).
const adHocChargeType = z.enum(CHARGE_TYPES.filter((t) => t !== 'LOYER') as [string, ...string[]]);

export const createChargeDto = z.object({
  occupancyId: uuid,
  type: adHocChargeType,
  amount: fcfaPositive,
  dueDate: isoDate,
  periodYear: z.number().int().min(2000).max(2100).optional(),
  periodMonth: z.number().int().min(1).max(12).optional(),
});
export type CreateChargeDto = z.infer<typeof createChargeDto>;

export const cancelChargeDto = z.object({
  reason: z.string().min(2), // motif obligatoire (F5.5)
});
export type CancelChargeDto = z.infer<typeof cancelChargeDto>;
