import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppEnv } from '../../common/config/env';
import { AfricasTalkingSmsProvider, toE164 } from './africastalking.provider';

function provider(overrides: Partial<AppEnv> = {}): AfricasTalkingSmsProvider {
  return new AfricasTalkingSmsProvider({
    SMS_USERNAME: 'bailo',
    SMS_API_KEY: 'key-123',
    ...overrides,
  } as AppEnv);
}

function mockFetch(status: number, body: unknown) {
  const fn = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  vi.stubGlobal('fetch', fn);
  return fn;
}

const accepted = {
  SMSMessageData: {
    Message: 'Sent to 1/1',
    Recipients: [{ number: '+237690000000', status: 'Success', statusCode: 101, messageId: 'm1' }],
  },
};

describe('toE164', () => {
  it('préfixe +237 aux numéros nationaux camerounais', () => {
    expect(toE164('690000000')).toBe('+237690000000');
    expect(toE164(' 6 90 00 00 00 ')).toBe('+237690000000');
  });
  it('conserve les numéros déjà internationaux', () => {
    expect(toE164('+237690000000')).toBe('+237690000000');
    expect(toE164('237690000000')).toBe('+237690000000');
    expect(toE164('00237690000000')).toBe('+237690000000');
  });
});

describe('AfricasTalkingSmsProvider (8.1)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('envoie en POST urlencoded avec la clé d’API et l’expéditeur', async () => {
    const fetchMock = mockFetch(201, accepted);
    await provider({ SMS_SENDER_ID: 'BAILO' }).send('690000000', 'Bailo : code 123456');

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.africastalking.com/version1/messaging');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      apiKey: 'key-123',
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    });
    const body = init.body as URLSearchParams;
    expect(body.get('username')).toBe('bailo');
    expect(body.get('to')).toBe('+237690000000');
    expect(body.get('message')).toBe('Bailo : code 123456');
    expect(body.get('from')).toBe('BAILO');
  });

  it('utilise le bac à sable quand SMS_USERNAME=sandbox', async () => {
    const fetchMock = mockFetch(201, accepted);
    await provider({ SMS_USERNAME: 'sandbox' }).send('690000000', 'x');
    expect(fetchMock.mock.calls[0]![0]).toBe(
      'https://api.sandbox.africastalking.com/version1/messaging',
    );
  });

  it('échoue si le destinataire est refusé (ex. solde insuffisant)', async () => {
    mockFetch(201, {
      SMSMessageData: {
        Message: 'Sent to 0/1',
        Recipients: [{ number: '+237690000000', status: 'InsufficientBalance', statusCode: 405 }],
      },
    });
    await expect(provider().send('690000000', 'x')).rejects.toThrow(/InsufficientBalance/);
  });

  it('échoue sur une erreur HTTP (clé invalide)', async () => {
    mockFetch(401, { message: 'The supplied authentication is invalid' });
    await expect(provider().send('690000000', 'x')).rejects.toThrow(/HTTP 401/);
  });

  it('ne divulgue pas le numéro complet dans les erreurs', async () => {
    mockFetch(201, {
      SMSMessageData: { Recipients: [{ status: 'InvalidPhoneNumber', statusCode: 403 }] },
    });
    await expect(provider().send('690000000', 'x')).rejects.toThrow(/•+00\b/);
  });
});
