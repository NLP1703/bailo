import { z } from 'zod';
import { SITE_TYPES, PRORATA_MODES } from '../enums';

export const createSiteDto = z.object({
  name: z.string().min(2),
  type: z.enum(SITE_TYPES),
  city: z.string().optional(),
  district: z.string().optional(),
  landmark: z.string().optional(),
  graceDays: z.number().int().min(0).max(60).default(0),
  prorataMode: z.enum(PRORATA_MODES).default('FULL'),
});
export type CreateSiteDto = z.infer<typeof createSiteDto>;

export const updateSiteDto = z
  .object({
    name: z.string().min(2).optional(),
    city: z.string().optional(),
    district: z.string().optional(),
    landmark: z.string().optional(),
    graceDays: z.number().int().min(0).max(60).optional(),
    prorataMode: z.enum(PRORATA_MODES).optional(),
    reminderJm3: z.boolean().optional(),
    reminderJ0: z.boolean().optional(),
    reminderJp5: z.boolean().optional(),
    reminderJp15: z.boolean().optional(),
  })
  .strict();
export type UpdateSiteDto = z.infer<typeof updateSiteDto>;

export const createBlockDto = z.object({
  name: z.string().min(1),
  sortOrder: z.number().int().min(0).default(0),
});
export type CreateBlockDto = z.infer<typeof createBlockDto>;
