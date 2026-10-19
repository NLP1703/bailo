// État des lieux — entrée et sortie, caution et retenues.
import { z } from 'zod';
import { uuid } from './common';
import { INSPECTION_KINDS, INSPECTION_CONDITIONS } from '../enums';

const isoDate = z.string().datetime({ offset: true }).or(z.string().date());

export const inspectionItemInput = z.object({
  room: z.string().min(1).max(80),
  element: z.string().min(1).max(80),
  condition: z.enum(INSPECTION_CONDITIONS),
  note: z.string().max(500).optional(),
  photoKeys: z.array(z.string()).default([]),
  estimatedCost: z.number().int().min(0).optional(),
});
export type InspectionItemInput = z.infer<typeof inspectionItemInput>;

export const createInspectionDto = z.object({
  occupancyId: uuid,
  kind: z.enum(INSPECTION_KINDS),
  performedAt: isoDate.optional(),
  summary: z.string().max(2000).optional(),
  photoKeys: z.array(z.string()).default([]),
  items: z.array(inspectionItemInput).default([]),
});
export type CreateInspectionDto = z.infer<typeof createInspectionDto>;

export const closeExitInspectionDto = z.object({
  /** Montant total de retenue sur caution (0 si rien à retenir). */
  withholding: z.number().int().min(0),
  withholdingNote: z.string().max(500).optional(),
  tenantSignatureName: z.string().min(2).max(120).optional(),
});
export type CloseExitInspectionDto = z.infer<typeof closeExitInspectionDto>;

/** Rendu "caution" pour une occupation. */
export interface DepositSummary {
  deposit: number;              // caution versée à l'entrée
  withholdings: { inspectionId: string; amount: number; note?: string | null }[];
  totalWithheld: number;
  refundable: number;           // caution - totalWithheld (jamais négatif)
}
