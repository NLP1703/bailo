import { z } from 'zod';
import { uuid } from './common';

/** Mois du tableau de bord au format "YYYY-MM" (défaut : mois courant). */
export const dashboardQuery = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, 'Format attendu YYYY-MM')
    .optional(),
  siteId: uuid.optional(),
});
export type DashboardQuery = z.infer<typeof dashboardQuery>;

export const arrearsQuery = z.object({
  siteId: uuid.optional(),
  sort: z.enum(['age', 'amount']).default('age'),
});
export type ArrearsQuery = z.infer<typeof arrearsQuery>;

export const EXPORT_TYPES = ['payments', 'arrears', 'tenants'] as const;
export type ExportType = (typeof EXPORT_TYPES)[number];

export const exportQuery = z.object({
  format: z.enum(['csv', 'pdf']).default('csv'),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  siteId: uuid.optional(),
});
export type ExportQuery = z.infer<typeof exportQuery>;
