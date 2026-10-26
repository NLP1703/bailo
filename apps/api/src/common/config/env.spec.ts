import { afterEach, describe, expect, it } from 'vitest';
import { loadEnv, resetEnvCache } from './env';

const BASE = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  JWT_ACCESS_SECRET: 'x'.repeat(40),
  JWT_REFRESH_SECRET: 'y'.repeat(40),
};

function load(vars: Record<string, string>) {
  const saved = process.env;
  process.env = { ...BASE, NODE_ENV: 'development', ...vars };
  resetEnvCache();
  try {
    return loadEnv();
  } finally {
    process.env = saved;
    resetEnvCache();
  }
}

describe('configuration (env)', () => {
  afterEach(() => resetEnvCache());

  it('traite les variables vides (compose / Railway) comme absentes', () => {
    const env = load({ SENTRY_DSN: '', EMAIL_FROM: '', EMAIL_API_KEY: '  ' });
    expect(env.SENTRY_DSN).toBeUndefined();
    expect(env.EMAIL_FROM).toBeUndefined();
    expect(env.EMAIL_API_KEY).toBeUndefined();
  });

  it('exige la clé et l’expéditeur quand un fournisseur e-mail réel est choisi', () => {
    expect(() => load({ EMAIL_PROVIDER: 'brevo' })).toThrow(/EMAIL_API_KEY et EMAIL_FROM/);
    expect(() =>
      load({ EMAIL_PROVIDER: 'resend', EMAIL_API_KEY: 'k', EMAIL_FROM: 'pas-un-email' }),
    ).toThrow(/EMAIL_FROM/);
    const env = load({
      EMAIL_PROVIDER: 'brevo',
      EMAIL_API_KEY: 'k',
      EMAIL_FROM: 'bailo@example.cm',
    });
    expect(env.EMAIL_PROVIDER).toBe('brevo');
    expect(env.EMAIL_FROM_NAME).toBe('Bailo');
  });

  it('Gmail : exige les trois identifiants OAuth et l’adresse expéditrice', () => {
    expect(() => load({ EMAIL_PROVIDER: 'gmail', EMAIL_FROM: 'moi@gmail.com' })).toThrow(
      /GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN/,
    );
    const env = load({
      EMAIL_PROVIDER: 'gmail',
      EMAIL_FROM: 'moi@gmail.com',
      GMAIL_CLIENT_ID: 'id',
      GMAIL_CLIENT_SECRET: 'secret',
      GMAIL_REFRESH_TOKEN: 'rt',
    });
    expect(env.EMAIL_PROVIDER).toBe('gmail');
    expect(env.EMAIL_API_KEY).toBeUndefined(); // pas de clé d'API pour Gmail
  });

  it('refuse SameSite=None sans cookie Secure', () => {
    expect(() => load({ COOKIE_SAMESITE: 'none', COOKIE_SECURE: 'false' })).toThrow(
      /COOKIE_SECURE/,
    );
    expect(load({ COOKIE_SAMESITE: 'none', COOKIE_SECURE: 'true' }).COOKIE_SAMESITE).toBe('none');
  });

  it('accepte PDF_ENGINE=html', () => {
    expect(load({ PDF_ENGINE: 'html' }).PDF_ENGINE).toBe('html');
  });
});
