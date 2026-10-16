import { z } from 'zod';
import { phone, email, password, uuid } from './common';
import { USER_ROLES, type SubscriptionPlan } from '../enums';

// Le propriétaire s'auto-crée au signup ; on n'invite que MANAGER/CARETAKER.
const invitableRole = z.enum(['MANAGER', 'CARETAKER']);

export const inviteUserDto = z.object({
  name: z.string().min(2),
  email: email.optional(),
  phone,
  role: invitableRole,
  password, // mot de passe provisoire communiqué hors-bande, ou reset par OTP
  siteIds: z.array(uuid).default([]),
});
export type InviteUserDto = z.infer<typeof inviteUserDto>;

export const updateUserDto = z
  .object({
    name: z.string().min(2).optional(),
    email: email.optional(),
    role: invitableRole.optional(),
    active: z.boolean().optional(),
    siteIds: z.array(uuid).optional(),
  })
  .strict();
export type UpdateUserDto = z.infer<typeof updateUserDto>;

export interface UserView {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  role: (typeof USER_ROLES)[number];
  active: boolean;
  siteIds: string[];
}

export interface MeView extends UserView {
  accountId: string;
  accountName: string;
  plan: SubscriptionPlan;
  readOnly: boolean; // compte en lecture seule (abonnement échu)
}
