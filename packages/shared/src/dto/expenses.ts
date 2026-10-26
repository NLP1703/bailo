// Dépenses du bailleur.
import { z } from 'zod';
import { uuid, optionalPaginationQuery } from './common';
import { EXPENSE_CATEGORIES } from '../enums';

const isoDate = z.string().datetime({ offset: true }).or(z.string().date());

export const createExpenseDto = z.object({
  siteId: uuid.optional(),
  category: z.enum(EXPENSE_CATEGORIES),
  label: z.string().min(2).max(200),
  amount: z.number().int().min(1),
  spentAt: isoDate,
  payee: z.string().max(120).optional(),
  proofKey: z.string().optional(),
  recurring: z.boolean().default(false),
  note: z.string().max(1000).optional(),
  ticketId: uuid.optional(),
});
export type CreateExpenseDto = z.infer<typeof createExpenseDto>;

export const updateExpenseDto = createExpenseDto.partial();
export type UpdateExpenseDto = z.infer<typeof updateExpenseDto>;

export const expenseListQuery = z.object({
  siteId: uuid.optional(),
  category: z.enum(EXPENSE_CATEGORIES).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
})
  .merge(optionalPaginationQuery);
export type ExpenseListQuery = z.infer<typeof expenseListQuery>;
