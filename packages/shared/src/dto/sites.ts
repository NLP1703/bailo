import { z } from 'zod';
import { SITE_TYPES, PRORATA_MODES, PENALTY_MODES, UNIT_TYPES } from '../enums';
import { fcfa } from '../money';

export const createSiteDto = z.object({
  name: z.string().min(2),
  type: z.enum(SITE_TYPES),
  city: z.string().optional(),
  district: z.string().optional(),
  landmark: z.string().optional(),
  graceDays: z.number().int().min(0).max(60).default(0),
  prorataMode: z.enum(PRORATA_MODES).default('FULL'),
  // Pour un IMMEUBLE on demande d'emblée si les logements sont meublés — ça pré-coche
  // le flag `furnished` au moment de créer les unités en lot (NF14, cohérence saisie).
  defaultFurnished: z.boolean().optional(),
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
    penaltyEnabled: z.boolean().optional(),
    penaltyMode: z.enum(PENALTY_MODES).optional(),
    penaltyValue: fcfa.optional(),
    penaltyGraceDays: z.number().int().min(0).max(60).optional(),
  })
  .strict();
export type UpdateSiteDto = z.infer<typeof updateSiteDto>;

export const createBlockDto = z.object({
  name: z.string().min(1),
  sortOrder: z.number().int().min(0).default(0),
});
export type CreateBlockDto = z.infer<typeof createBlockDto>;

/**
 * Mise en service juste après l'inscription (F2.1/F2.3) : on crée le bâtiment
 * puis ses unités (chambres, studios, maisons…) avec leur prix. Une maison peut
 * décrire ses pièces (bedrooms + rooms). On indique aussi si c'est meublé et si
 * le bailleur a déjà des locataires (pour enchaîner sur leur saisie).
 */
export const onboardingUnitDto = z.object({
  type: z.enum(UNIT_TYPES),
  code: z.string().min(1).max(20),
  baseRent: fcfa,
  capacity: z.number().int().min(1).default(1),
  bedrooms: z.number().int().min(0).max(50).optional(),
  rooms: z.array(z.string()).default([]),
});
export type OnboardingUnitDto = z.infer<typeof onboardingUnitDto>;

export const onboardingDto = z.object({
  site: z.object({
    name: z.string().min(2),
    type: z.enum(SITE_TYPES),
    city: z.string().optional(),
    district: z.string().optional(),
  }),
  furnished: z.boolean().default(false),
  units: z.array(onboardingUnitDto).min(1).max(500),
  hasExistingTenants: z.boolean().default(false),
});
export type OnboardingDto = z.infer<typeof onboardingDto>;
