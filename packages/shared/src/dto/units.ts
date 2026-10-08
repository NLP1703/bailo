import { z } from 'zod';
import { uuid } from './common';
import { fcfa } from '../money';
import { UNIT_TYPES, UNIT_MANUAL_STATUSES } from '../enums';

export const createUnitDto = z.object({
  blockId: uuid.optional(),
  code: z.string().min(1).max(20),
  type: z.enum(UNIT_TYPES).default('CHAMBRE'),
  baseRent: fcfa,
  chargesIncluded: z.boolean().default(false),
  shared: z.boolean().default(false),
  capacity: z.number().int().min(1).default(1),
  amenities: z.array(z.string()).default([]),
});
export type CreateUnitDto = z.infer<typeof createUnitDto>;

/**
 * Création en série : « A01 à A24 à 25 000 FCFA ».
 * Le préfixe + numéro de début/fin, largeur de padding déduite du début (A01 -> width 2).
 */
export const bulkCreateUnitsDto = z.object({
  blockId: uuid.optional(),
  prefix: z.string().max(10).default(''),
  from: z.number().int().min(0),
  to: z.number().int().min(0),
  padding: z.number().int().min(1).max(6).default(2),
  type: z.enum(UNIT_TYPES).default('CHAMBRE'),
  baseRent: fcfa,
  chargesIncluded: z.boolean().default(false),
  shared: z.boolean().default(false),
  capacity: z.number().int().min(1).default(1),
});
export type BulkCreateUnitsDto = z.infer<typeof bulkCreateUnitsDto>;

export const updateUnitDto = z
  .object({
    blockId: uuid.nullable().optional(),
    code: z.string().min(1).max(20).optional(),
    type: z.enum(UNIT_TYPES).optional(),
    baseRent: fcfa.optional(),
    chargesIncluded: z.boolean().optional(),
    shared: z.boolean().optional(),
    capacity: z.number().int().min(1).optional(),
    amenities: z.array(z.string()).optional(),
    photoKeys: z.array(z.string()).optional(),
    manualStatus: z.enum(UNIT_MANUAL_STATUSES).optional(),
  })
  .strict();
export type UpdateUnitDto = z.infer<typeof updateUnitDto>;

export const listUnitsQuery = z.object({
  siteId: uuid,
  blockId: uuid.optional(),
  status: z.enum(['GREEN', 'ORANGE', 'RED', 'GREY', 'BLUE']).optional(),
});
export type ListUnitsQuery = z.infer<typeof listUnitsQuery>;
