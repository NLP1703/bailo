import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppEnv } from '../../common/config/env';
import { BrevoMailProvider, ResendMailProvider } from './http-mail.providers';
import { ConsoleMailProvider, maskEmail } from './mail.provider';
import { contractSignatureMail, passwordResetMail } from './mail.templates';

const env = (overrides: Partial<AppEnv> = {}) =>
  ({
    NODE_ENV: 'development',
    EMAIL_API_KEY: 'key-123',
    EMAIL_FROM: 'bailo@example.cm',
    EMAIL_FROM_NAME: 'Bailo',
    ...overrides,
  }) as AppEnv;

function mockFetch(status: number, body: unknown = {}) {
  const fn = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  vi.stubGlobal('fetch', fn);
  return fn;
}

const message = passwordResetMail('obelix@gmail.com', '123456', 300);

describe('gabarits e-mail', () => {
  it('reset : code dans le sujet, le texte et le HTML ; durée en minutes', () => {
    expect(message.subject).toContain('123456');
    expect(message.text).toContain('Code : 123456');
    expect(message.text).toContain('5 minutes');
    expect(message.html).toContain('123456');
  });

  it('contrat : échappe le HTML des noms saisis', () => {
    const m = contractSignatureMail('t@x.cm', {
      code: '654321',
      reference: 'CTR-2026-001',
      tenantName: '<script>alert(1)</script>',
      landlordName: 'Cité & Co',
      ttlSeconds: 600,
    });
    expect(m.html).not.toContain('<script>');
    expect(m.html).toContain('&lt;script&gt;');
    expect(m.html).toContain('Cité &amp; Co');
    expect(m.subject).toContain('CTR-2026-001');
  });
});

describe('fournisseurs e-mail', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('Brevo : POST /v3/smtp/email avec api-key, expéditeur et réponse', async () => {
    const fetchMock = mockFetch(201, { messageId: '<m1>' });
    await new BrevoMailProvider(env({ EMAIL_REPLY_TO: 'contact@example.cm' })).send(message);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(init.headers).toMatchObject({
      'api-key': 'key-123',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(init.body as string)).toEqual({
      sender: { email: 'bailo@example.cm', name: 'Bailo' },
      to: [{ email: 'obelix@gmail.com' }],
      subject: message.subject,
      textContent: message.text,
      htmlContent: message.html,
      replyTo: { email: 'contact@example.cm' },
    });
  });

  it('Resend : POST /emails avec jeton Bearer', async () => {
    const fetchMock = mockFetch(200, { id: 'e1' });
    await new ResendMailProvider(env()).send(message);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer key-123' });
    expect(JSON.parse(init.body as string)).toMatchObject({
      from: 'Bailo <bailo@example.cm>',
      to: ['obelix@gmail.com'],
      text: message.text,
    });
  });

  it('erreur HTTP explicite, adresse masquée', async () => {
    mockFetch(401, { message: 'Key not found' });
    await expect(new BrevoMailProvider(env()).send(message)).rejects.toThrow(
      /Brevo a refusé l'e-mail vers ob•+@gmail\.com \(HTTP 401\)/,
    );
  });

  it('console : interdit en production', async () => {
    await expect(
      new ConsoleMailProvider(env({ NODE_ENV: 'production' })).send(message),
    ).rejects.toThrow(/interdit en production/);
    await expect(new ConsoleMailProvider(env()).send(message)).resolves.toBeUndefined();
  });

  it('masque les adresses', () => {
    expect(maskEmail('obelix@gmail.com')).toBe('ob••••@gmail.com');
  });
});
