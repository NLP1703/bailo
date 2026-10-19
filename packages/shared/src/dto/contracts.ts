// Contrats de bail + signature électronique.
import { z } from 'zod';
import { uuid } from './common';
import { fcfaPositive } from '../money';
import { CONTRACT_STATUSES } from '../enums';

const isoDate = z.string().datetime({ offset: true }).or(z.string().date());

export const createContractDto = z.object({
  occupancyId: uuid,
  monthlyRent: fcfaPositive,
  deposit: z.number().int().min(0),
  startDate: isoDate,
  durationMonths: z.number().int().min(1).max(240).nullable().optional(),
  noticeDays: z.number().int().min(0).max(365).default(30),
  /** Rendu HTML pré-rempli depuis le template Modèle de contrat. */
  bodyHtml: z.string().min(50),
});
export type CreateContractDto = z.infer<typeof createContractDto>;

export const sendForSignatureDto = z.object({
  /** Canal de l'OTP de signature. */
  channel: z.enum(['SMS', 'WHATSAPP']).default('SMS'),
});
export type SendForSignatureDto = z.infer<typeof sendForSignatureDto>;

export const signContractDto = z.object({
  otpCode: z.string().min(4).max(10),
  /** Nom tapé par le locataire pour mémoire. */
  tenantSignatureName: z.string().min(2).max(120),
});
export type SignContractDto = z.infer<typeof signContractDto>;

export const terminateContractDto = z.object({
  reason: z.string().min(2),
});
export type TerminateContractDto = z.infer<typeof terminateContractDto>;

export const contractListQuery = z.object({
  status: z.enum(CONTRACT_STATUSES).optional(),
  tenantId: uuid.optional(),
  occupancyId: uuid.optional(),
});
export type ContractListQuery = z.infer<typeof contractListQuery>;
