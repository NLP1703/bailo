import { z } from 'zod';
import { uuid, phone } from './common';
import { fcfaPositive } from '../money';

const isoDate = z.string().datetime({ offset: true }).or(z.string().date());

/**
 * Une ligne d'import (le front parse l'Excel/CSV « modèle » en lignes).
 * `paidUntil` = « déjà payé jusqu'au mois de… » (format YYYY-MM) → crée les échéances
 * et un paiement d'ouverture couvrant ces mois (P1).
 */
export const importTenantRow = z.object({
  name: z.string().min(2),
  phone: phone.optional(),
  whatsapp: phone.optional(),
  unitCode: z.string().min(1),
  monthlyRent: fcfaPositive,
  startDate: isoDate,
  dueDay: z.number().int().min(1).max(28).optional(),
  deposit: fcfaPositive.optional(),
  paidUntil: z
    .string()
    .regex(/^\d{4}-\d{2}$/, 'Format attendu YYYY-MM')
    .optional(),
});
export type ImportTenantRow = z.infer<typeof importTenantRow>;

export const importTenantsDto = z.object({
  siteId: uuid,
  rows: z.array(importTenantRow).min(1).max(1000),
});
export type ImportTenantsDto = z.infer<typeof importTenantsDto>;

export interface ImportRowResult {
  row: number;
  status: 'ok' | 'error';
  tenantId?: string;
  occupancyId?: string;
  error?: string;
}
