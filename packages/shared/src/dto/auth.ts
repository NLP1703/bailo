import { z } from 'zod';
import { phone, email, password, otpCode } from './common';
import { OTP_PURPOSES } from '../enums';

export const requestOtpDto = z.object({
  phone,
  purpose: z.enum(OTP_PURPOSES),
});
export type RequestOtpDto = z.infer<typeof requestOtpDto>;

export const signupDto = z.object({
  accountName: z.string().min(2),
  ownerName: z.string().min(2),
  email,
  phone,
  password,
});
export type SignupDto = z.infer<typeof signupDto>;

// Connexion par email OU téléphone : au moins un identifiant est requis.
export const loginDto = z
  .object({
    email: email.optional(),
    phone: phone.optional(),
    password,
  })
  .refine((dto) => Boolean(dto.email) || Boolean(dto.phone), {
    message: 'Email ou téléphone requis',
    path: ['phone'],
  });
export type LoginDto = z.infer<typeof loginDto>;

/**
 * Renouvellement de session. Le refresh token voyage normalement dans le cookie
 * HttpOnly `bailo_rt` (navigateur) ; le corps n'est utilisé que par les clients
 * natifs (en-tête `X-Bailo-Client: native`) et pour migrer une ancienne session
 * stockée dans le navigateur.
 */
export const refreshDto = z
  .object({
    refreshToken: z.string().min(10).optional(),
  })
  .default({});
export type RefreshDto = z.infer<typeof refreshDto>;

export const passwordResetDto = z.object({
  phone,
  otp: otpCode,
  newPassword: password,
});
export type PasswordResetDto = z.infer<typeof passwordResetDto>;

export const logoutDto = z
  .object({
    refreshToken: z.string().min(10).optional(),
  })
  .default({});
export type LogoutDto = z.infer<typeof logoutDto>;

/** Couple de jetons émis côté serveur (le refresh est opaque, stocké haché en base). */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/** Nom du cookie HttpOnly qui porte le refresh token (sécurité 1.2). */
export const REFRESH_COOKIE_NAME = 'bailo_rt';

/** En-tête par lequel un client natif (app mobile, scripts) demande le refresh dans le corps. */
export const NATIVE_CLIENT_HEADER = 'x-bailo-client';

/**
 * Réponse des routes d'authentification. Pour un navigateur, le refresh token
 * n'est **jamais** dans le corps : il est posé en cookie HttpOnly, inaccessible
 * au JavaScript. `refreshToken` n'est renvoyé qu'aux clients natifs.
 */
export interface AuthSession {
  accessToken: string;
  expiresIn: number;
  refreshToken?: string;
}
