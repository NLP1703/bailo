import { z } from 'zod';
import { SUBSCRIPTION_PLANS, type SubscriptionPlan } from '../enums';

/** Profil du propriétaire affiché sur les reçus (F1.5). Le téléphone sert d'identifiant
 * de connexion : il n'est pas modifiable ici. */
export const updateAccountDto = z
  .object({
    name: z.string().min(2).optional(),
    logoKey: z.string().max(512).nullable().optional(),
    receiptFooter: z.string().max(280).nullable().optional(),
  })
  .strict();
export type UpdateAccountDto = z.infer<typeof updateAccountDto>;

/** Changement d'offre (propriétaire). Le paiement Mobile Money viendra en V2. */
export const updatePlanDto = z.object({ plan: z.enum(SUBSCRIPTION_PLANS) }).strict();
export type UpdatePlanDto = z.infer<typeof updatePlanDto>;

export interface BillingSummary {
  plan: SubscriptionPlan;
  subscriptionEndAt: string | null;
  readOnly: boolean;
  limits: {
    maxSites: number | null;
    maxUnits: number | null;
    maxUsers: number | null;
    pricePerUnit: number;
    pricePerMonth: number;
    pricePerYear: number;
  };
  usage: { sites: number; units: number; users: number };
}
