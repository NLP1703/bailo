import { z } from 'zod';
import { createPaymentDto } from './payments';

/**
 * File hors-ligne poussée au retour du réseau (NF3). Au MVP, seuls les paiements
 * sont saisissables hors-ligne ; chaque opération porte le `clientId` qui garantit
 * l'idempotence (aucun doublon même après plusieurs tentatives).
 */
export const syncPushDto = z.object({
  payments: z.array(createPaymentDto).default([]),
});
export type SyncPushDto = z.infer<typeof syncPushDto>;

export const syncPullQuery = z.object({
  since: z.string().datetime({ offset: true }).optional(),
});
export type SyncPullQuery = z.infer<typeof syncPullQuery>;
