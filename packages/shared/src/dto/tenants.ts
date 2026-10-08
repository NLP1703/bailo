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
  archived: z.coerce.boolean().optional(),
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
