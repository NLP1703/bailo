import { z } from 'zod';

/** Profil du propriétaire affiché sur les reçus (F1.5). Le téléphone sert d'identifiant
 * de connexion : il n'est pas modifiable ici. */
export const updateAccountDto = z
  .object({
    name: z.string().min(2).optional(),
    logoKey: z.string().max(512).nullable().optional(),
    receiptFooter: z.string().max(280).nullable().optional(),
  })
  .strict();
export type UpdateAccountDto = z.infer<typeof updateAccountDto>;
