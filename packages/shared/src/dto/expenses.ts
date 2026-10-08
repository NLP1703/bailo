import { z } from 'zod';
import { uuid } from './common';
import { fcfaPositive } from '../money';
import { EXPENSE_CATEGORIES } from '../enums';

const isoDate = z.string().datetime({ offset: true }).or(z.string().date());

export const createExpenseDto = z.object({
  siteId: uuid,
  unitId: uuid.optional(),
  category: z.enum(EXPENSE_CATEGORIES),
  amount: fcfaPositive,
  spentAt: isoDate,
  description: z.string().max(240).optional(),
  attachmentKey: z.string().optional(),
});
export type CreateExpenseDto = z.infer<typeof createExpenseDto>;

export const listExpensesQuery = z.object({
  siteId: uuid.optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
});
export type ListExpensesQuery = z.infer<typeof listExpensesQuery>;
