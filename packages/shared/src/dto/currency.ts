// Taux de change (mode diaspora).
import { z } from 'zod';
import { CURRENCIES } from '../enums';

export const setExchangeRateDto = z.object({
  base: z.enum(CURRENCIES),
  quote: z.enum(CURRENCIES),
  rate: z.number().positive().finite(),
});
export type SetExchangeRateDto = z.infer<typeof setExchangeRateDto>;

/** Préférence d'affichage (compte). */
export const updateAccountCurrencyDto = z.object({
  displayCurrency: z.enum(CURRENCIES),
  diasporaMode: z.boolean().optional(),
});
export type UpdateAccountCurrencyDto = z.infer<typeof updateAccountCurrencyDto>;
