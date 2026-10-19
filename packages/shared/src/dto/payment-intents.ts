// Intents de paiement (MoMo / Orange Money Collect) — demande, suivi, webhook.
import { z } from 'zod';
import { uuid } from './common';
import { fcfaPositive } from '../money';
import { PAYMENT_INTENT_STATUSES, PAYMENT_PROVIDERS, CURRENCIES } from '../enums';

/** Numéro de téléphone MSISDN avec indicatif (+237...) ou local Cameroun (6/2 + 8 chiffres). */
const phone = z
  .string()
  .trim()
  .regex(/^(\+?\d{8,15})$/, 'Numéro invalide');

export const createPaymentIntentDto = z.object({
  occupancyId: uuid,
  provider: z.enum(PAYMENT_PROVIDERS),
  phone,
  amount: fcfaPositive,
  currency: z.enum(CURRENCIES).optional(),
  /** Ventilation prévisionnelle vers des échéances (sinon FIFO côté API après succès). */
  allocationPlan: z
    .array(z.object({ chargeId: uuid, amount: fcfaPositive }))
    .optional(),
  /** UUID client, anti-doublon hors-ligne (NF3). */
  idempotencyKey: uuid,
});
export type CreatePaymentIntentDto = z.infer<typeof createPaymentIntentDto>;

export const paymentIntentListQuery = z.object({
  status: z.enum(PAYMENT_INTENT_STATUSES).optional(),
  occupancyId: uuid.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type PaymentIntentListQuery = z.infer<typeof paymentIntentListQuery>;

/** Payload webhook minimal — chaque provider a son format, le controller normalise. */
export const providerWebhookDto = z.object({
  providerRef: z.string().min(1),
  status: z.enum(PAYMENT_INTENT_STATUSES),
  statusMessage: z.string().optional(),
  rawPayload: z.record(z.unknown()).optional(),
});
export type ProviderWebhookDto = z.infer<typeof providerWebhookDto>;
