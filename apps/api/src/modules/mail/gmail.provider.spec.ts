import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppEnv } from '../../common/config/env';
import { buildMime, GmailMailProvider } from './gmail.provider';
import { passwordResetMail } from './mail.templates';

const env = (overrides: Partial<AppEnv> = {}) =>
  ({
    NODE_ENV: 'production',
    EMAIL_FROM: 'pharel.bailo@gmail.com',
    EMAIL_FROM_NAME: 'Bailo — Cité Soleil',
    GMAIL_CLIENT_ID: 'client-id',
    GMAIL_CLIENT_SECRET: 'client-secret',
    GMAIL_REFRESH_TOKEN: 'refresh-token',
    ...overrides,
  }) as AppEnv;

const message = passwordResetMail('locataire@yahoo.fr', '482913', 300);

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Décode une partie base64 du MIME (pour vérifier le contenu réel). */
function decodePart(mime: string, contentType: string): string {
  const start = mime.indexOf(`Content-Type: ${contentType}`);
  const body = mime.slice(start).split('\r\n\r\n')[1]!.split('\r\n--')[0]!;
  return Buffer.from(body.replace(/\r\n/g, ''), 'base64').toString('utf8');
}

describe('buildMime', () => {
  it('encode les en-têtes accentués (RFC 2047) et les deux corps en UTF-8', () => {
    const mime = buildMime(
      message,
      { email: 'pharel.bailo@gmail.com', name: 'Bailo — Cité Soleil' },
      'contact@x.cm',
    );
    const subject = /^Subject: =\?UTF-8\?B\?([^?]+)\?=$/m.exec(mime)![1]!;
    expect(Buffer.from(subject, 'base64').toString('utf8')).toBe(message.subject);
    const fromName = /^From: =\?UTF-8\?B\?([^?]+)\?= <pharel\.bailo@gmail\.com>$/m.exec(mime)![1]!;
    expect(Buffer.from(fromName, 'base64').toString('utf8')).toBe('Bailo — Cité Soleil');
    expect(mime).toMatch(/^To: locataire@yahoo\.fr$/m);
    expect(mime).toMatch(/^Reply-To: contact@x\.cm$/m);
    expect(mime).toMatch(/multipart\/alternative; boundary="bailo-[0-9a-f]{24}"/);
    expect(decodePart(mime, 'text/plain')).toBe(message.text);
    expect(decodePart(mime, 'text/html')).toBe(message.html);
    // Lignes base64 ≤ 76 caractères, fins de ligne CRLF.
    expect(mime.split('\r\n').every((l) => l.length <= 998)).toBe(true);
  });

  it('laisse un sujet ASCII tel quel', () => {
    const mime = buildMime(
      { to: 'a@b.cm', subject: 'Code 123456', text: 'x' },
      { email: 'f@gmail.com', name: 'Bailo' },
    );
    expect(mime).toMatch(/^Subject: Code 123456$/m);
    expect(mime).toMatch(/^From: Bailo <f@gmail\.com>$/m);
    expect(mime).not.toContain('multipart');
  });
});

describe('GmailMailProvider', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('obtient un jeton par refresh_token puis envoie via users.messages.send', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(200, { access_token: 'ya29.token', expires_in: 3599 }))
      .mockResolvedValueOnce(json(200, { id: 'msg-1' }))
      .mockResolvedValueOnce(json(200, { id: 'msg-2' }));
    vi.stubGlobal('fetch', fetchMock);
    const provider = new GmailMailProvider(env());

    await provider.send(message);
    await provider.send(message); // jeton réutilisé : pas de second appel au serveur OAuth

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0]!;
    expect(tokenUrl).toBe('https://oauth2.googleapis.com/token');
    const form = tokenInit.body as URLSearchParams;
    expect(form.get('grant_type')).toBe('refresh_token');
    expect(form.get('refresh_token')).toBe('refresh-token');
    expect(form.get('client_id')).toBe('client-id');

    const [sendUrl, sendInit] = fetchMock.mock.calls[1]!;
    expect(sendUrl).toBe('https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
    expect(sendInit.headers).toMatchObject({ Authorization: 'Bearer ya29.token' });
    const raw = JSON.parse(sendInit.body as string).raw as string;
    expect(raw).not.toMatch(/[+/=]/); // base64url sans remplissage
    expect(Buffer.from(raw, 'base64url').toString('utf8')).toMatch(/^To: locataire@yahoo\.fr$/m);
  });

  it('explique un jeton révoqué ou expiré (invalid_grant)', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          json(400, {
            error: 'invalid_grant',
            error_description: 'Token has been expired or revoked.',
          }),
        ),
    );
    await expect(new GmailMailProvider(env()).send(message)).rejects.toThrow(
      /autorisation refusée \(Token has been expired or revoked\.\) — regénérer GMAIL_REFRESH_TOKEN/,
    );
  });

  it('refuse sans identifiants OAuth', async () => {
    await expect(
      new GmailMailProvider(env({ GMAIL_REFRESH_TOKEN: undefined })).send(message),
    ).rejects.toThrow(/GMAIL_REFRESH_TOKEN/);
  });

  it('erreur d’envoi explicite, adresse masquée', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(json(200, { access_token: 't', expires_in: 3599 }))
        .mockResolvedValueOnce(json(403, { error: { message: 'Insufficient Permission' } })),
    );
    await expect(new GmailMailProvider(env()).send(message)).rejects.toThrow(
      /Gmail a refusé l'e-mail vers lo•+@yahoo\.fr \(HTTP 403\)/,
    );
  });
});
