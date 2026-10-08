import { z } from 'zod';
import { uuid } from './common';
import { fcfaPositive } from '../money';
import { PAYMENT_MODES } from '../enums';

const isoDate = z.string().datetime({ offset: true }).or(z.string().date());

/** Ligne d'affectation manuelle (sinon affectation auto FIFO — RG5). */
export const allocationInput = z.object({
  chargeId: uuid,
  amount: fcfaPositive,
});
export type AllocationInput = z.infer<typeof allocationInput>;

export const createPaymentDto = z.object({
  occupancyId: uuid,
  /** UUID généré côté client : idempotence anti-doublon hors-ligne (NF3). */
  clientId: uuid,
  amount: fcfaPositive,
  mode: z.enum(PAYMENT_MODES),
  reference: z.string().max(120).optional(),
  paidAt: isoDate.optional(), // défaut : maintenant
  proofKey: z.string().optional(), // clé objet S3 de la preuve
  /** Affectation manuelle ; absente = automatique (plus anciennes d'abord). */
  allocations: z.array(allocationInput).optional(),
});
export type CreatePaymentDto = z.infer<typeof createPaymentDto>;

export const voidPaymentDto = z.object({
  reason: z.string().min(2), // motif obligatoire (RG8)
});
export type VoidPaymentDto = z.infer<typeof voidPaymentDto>;

/** Aperçu d'affectation avant validation (écran Encaisser). */
export const previewAllocationQuery = z.object({
  occupancyId: uuid,
  amount: fcfaPositive,
});
export type PreviewAllocationQuery = z.infer<typeof previewAllocationQuery>;
