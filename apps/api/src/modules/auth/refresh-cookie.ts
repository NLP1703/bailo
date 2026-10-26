import type { CookieOptions, Request, Response } from 'express';
import {
  NATIVE_CLIENT_HEADER,
  REFRESH_COOKIE_NAME,
  type AuthSession,
  type AuthTokens,
} from '@bailo/shared';
import type { AppEnv } from '../../common/config/env';
import { durationToMs } from '../../common/time/duration';

/**
 * Le cookie n'est envoyé qu'aux routes d'authentification : il ne voyage pas
 * avec chaque appel métier, et ne sert qu'à `refresh` / `logout`.
 */
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

function cookieOptions(env: AppEnv): CookieOptions {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAMESITE,
    path: REFRESH_COOKIE_PATH,
  };
}

/** Lit un cookie dans l'en-tête brut (pas de dépendance à un middleware de parsing). */
export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    const value = part.slice(eq + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return undefined;
}

/** Vrai si l'appelant est un client natif qui gère lui-même son refresh token. */
export function isNativeClient(req: Request): boolean {
  const value = req.headers[NATIVE_CLIENT_HEADER];
  return (Array.isArray(value) ? value[0] : value)?.toLowerCase() === 'native';
}

/** Refresh présenté : cookie HttpOnly en priorité, sinon corps (client natif / migration). */
export function presentedRefreshToken(req: Request, bodyToken?: string): string | undefined {
  return readCookie(req, REFRESH_COOKIE_NAME) ?? bodyToken;
}

/**
 * Pose le refresh en cookie HttpOnly et construit la réponse : le refresh n'est
 * dans le corps que pour un client natif.
 */
export function sendSession(
  req: Request,
  res: Response,
  env: AppEnv,
  tokens: AuthTokens,
): AuthSession {
  res.cookie(REFRESH_COOKIE_NAME, tokens.refreshToken, {
    ...cookieOptions(env),
    maxAge: durationToMs(env.JWT_REFRESH_TTL),
  });
  const session: AuthSession = { accessToken: tokens.accessToken, expiresIn: tokens.expiresIn };
  if (isNativeClient(req)) session.refreshToken = tokens.refreshToken;
  return session;
}

/** Supprime le cookie de refresh (déconnexion, session invalide). */
export function clearRefreshCookie(res: Response, env: AppEnv): void {
  res.clearCookie(REFRESH_COOKIE_NAME, cookieOptions(env));
}
