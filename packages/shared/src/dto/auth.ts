import { z } from 'zod';
import { phone, password, otpCode } from './common';
import { OTP_PURPOSES } from '../enums';

export const requestOtpDto = z.object({
  phone,
  purpose: z.enum(OTP_PURPOSES),
});
export type RequestOtpDto = z.infer<typeof requestOtpDto>;

export const signupDto = z.object({
  accountName: z.string().min(2),
  ownerName: z.string().min(2),
  phone,
  password,
  otp: otpCode,
});
export type SignupDto = z.infer<typeof signupDto>;

export const loginDto = z.object({
  phone,
  password,
});
export type LoginDto = z.infer<typeof loginDto>;

export const refreshDto = z.object({
  refreshToken: z.string().min(10),
});
export type RefreshDto = z.infer<typeof refreshDto>;

export const passwordResetDto = z.object({
  phone,
  otp: otpCode,
  newPassword: password,
});
export type PasswordResetDto = z.infer<typeof passwordResetDto>;

export const logoutDto = z.object({
  refreshToken: z.string().min(10),
});
export type LogoutDto = z.infer<typeof logoutDto>;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}
