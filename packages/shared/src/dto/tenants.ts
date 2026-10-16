import { z } from 'zod';
import { phone } from './common';

export const createTenantDto = z.object({
  name: z.string().min(2),
  phone: phone.optional(),
  whatsapp: phone.optional(),
  idDocType: z.string().optional(),
  idDocNumber: z.string().optional(),
  idDocKey: z.string().optional(),
  photoKey: z.string().optional(),
  occupation: z.string().optional(),
  emergencyName: z.string().optional(),
  emergencyPhone: phone.optional(),
  notes: z.string().optional(),
});
export type CreateTenantDto = z.infer<typeof createTenantDto>;

export const updateTenantDto = createTenantDto.partial().strict();
export type UpdateTenantDto = z.infer<typeof updateTenantDto>;

export const listTenantsQuery = z.object({
  q: z.string().optional(), // recherche nom / téléphone / code chambre
  // `z.coerce.boolean()` transformerait la chaîne "false" en `true` : on parse explicitement.
  archived: z.preprocess(
    (v) => (v === 'true' || v === true ? true : v === 'false' || v === false ? false : v),
    z.boolean().optional(),
  ),
  /** Filtre fonctionnel appliqué sur l'occupation active du locataire. */
  status: z
    .enum(['all', 'active', 'notice', 'closed', 'overdue', 'advance', 'upcoming'])
    .optional(),
  siteId: z.string().uuid().optional(),
});
export type ListTenantsQuery = z.infer<typeof listTenantsQuery>;

export const createGuarantorDto = z.object({
  name: z.string().min(2),
  phone: phone.optional(),
  whatsapp: phone.optional(),
  relationship: z.string().optional(),
  isPrimaryPayer: z.boolean().default(false),
});
export type CreateGuarantorDto = z.infer<typeof createGuarantorDto>;

export const updateGuarantorDto = createGuarantorDto.partial().strict();
export type UpdateGuarantorDto = z.infer<typeof updateGuarantorDto>;

/**
 * Résultat du pré-contrôle de suppression d'un locataire :
 * - `delete`  : aucun paiement jamais saisi → suppression définitive possible
 *               (occupations, échéances, relances et garants partent avec lui) ;
 * - `archive` : un historique de paiements existe et toutes les occupations sont
 *               clôturées → on archive (les reçus restent valables en comptabilité) ;
 * - `blocked` : occupation en cours avec des paiements → enregistrer la sortie d'abord.
 */
export type TenantDeletionMode = 'delete' | 'archive' | 'blocked';

export interface TenantDeletionCheck {
  mode: TenantDeletionMode;
  archived: boolean;
  counts: {
    occupancies: number;
    activeOccupancies: number;
    payments: number;
    charges: number;
    guarantors: number;
  };
}
