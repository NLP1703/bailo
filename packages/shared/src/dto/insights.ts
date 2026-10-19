// Intelligence : anomalies, score locataire, suggestion de prix.
import { z } from 'zod';
import { uuid } from './common';
import { ANOMALY_KINDS } from '../enums';

export const resolveAnomalyDto = z.object({
  note: z.string().max(500).optional(),
});
export type ResolveAnomalyDto = z.infer<typeof resolveAnomalyDto>;

export const anomaliesQuery = z.object({
  kind: z.enum(ANOMALY_KINDS).optional(),
  siteId: uuid.optional(),
  includeResolved: z.coerce.boolean().default(false),
});
export type AnomaliesQuery = z.infer<typeof anomaliesQuery>;

export interface ReliabilityScoreView {
  tenantId: string;
  score: number;        // 0..100
  onTimeRate: number;   // 0..1
  avgDelayDays: number;
  totalPayments: number;
  computedAt: string;
}

export interface PriceSuggestion {
  siteId: string;
  district?: string | null;
  marketReferenceRent?: number | null;
  avgSiteRent: number;
  minSiteRent: number;
  maxSiteRent: number;
  suggestion: number;
}
