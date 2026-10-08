import { z } from 'zod';

/** UUID v4 généré côté client ou serveur. */
export const uuid = z.string().uuid();

/**
 * Numéro de téléphone. Cible : Cameroun (mobile à 9 chiffres commençant par 6),
 * indicatif +237 optionnel. On reste tolérant pour l'international.
 */
export const phone = z
  .string()
  .trim()
  .regex(/^\+?\d{8,15}$/, 'Numéro de téléphone invalide');

/** Mot de passe : au moins 8 caractères. */
export const password = z.string().min(8, 'Au moins 8 caractères');

/** Code OTP à 6 chiffres. */
export const otpCode = z.string().regex(/^\d{6}$/, 'Code à 6 chiffres');

/** Locale supportée. */
export const locale = z.enum(['fr', 'en']);

export const paginationQuery = z.object({
  cursor: uuid.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type PaginationQuery = z.infer<typeof paginationQuery>;
