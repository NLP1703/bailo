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
    const env = load({ SENTRY_DSN: '', SMS_USERNAME: '', SMS_API_KEY: '  ' });
    expect(env.SENTRY_DSN).toBeUndefined();
    expect(env.SMS_USERNAME).toBeUndefined();
    expect(env.SMS_API_KEY).toBeUndefined();
  });

  it("exige les identifiants Africa's Talking quand ce fournisseur est choisi", () => {
    expect(() => load({ SMS_PROVIDER: 'africastalking' })).toThrow(/SMS_USERNAME/);
    expect(
      load({ SMS_PROVIDER: 'africastalking', SMS_USERNAME: 'bailo', SMS_API_KEY: 'k' })
        .SMS_PROVIDER,
    ).toBe('africastalking');
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
