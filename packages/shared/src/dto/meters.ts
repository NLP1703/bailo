// Compteurs eau / électricité + relevés + refacturation.
import { z } from 'zod';
import { uuid } from './common';
import { METER_TYPES } from '../enums';

const isoDate = z.string().datetime({ offset: true }).or(z.string().date());

export const createMeterDto = z.object({
  unitId: uuid,
  type: z.enum(METER_TYPES),
  identifier: z.string().max(80).optional(),
  unitPrice: z.number().int().min(0),
  unitLabel: z.string().max(20).default(''),
});
export type CreateMeterDto = z.infer<typeof createMeterDto>;

export const updateMeterDto = createMeterDto.partial().extend({
  active: z.boolean().optional(),
});
export type UpdateMeterDto = z.infer<typeof updateMeterDto>;

export const recordReadingDto = z.object({
  meterId: uuid,
  value: z.number().int().min(0),
  readAt: isoDate.optional(),
  photoKey: z.string().optional(),
  note: z.string().max(500).optional(),
  /** Si vrai : crée automatiquement une échéance EAU/ELECTRICITE pour l'occupation active. */
  billOccupancy: z.boolean().default(true),
});
export type RecordReadingDto = z.infer<typeof recordReadingDto>;

export const readingsQuery = z.object({
  meterId: uuid.optional(),
  unitId: uuid.optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
});
export type ReadingsQuery = z.infer<typeof readingsQuery>;
