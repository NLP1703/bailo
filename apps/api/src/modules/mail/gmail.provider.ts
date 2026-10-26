import { randomBytes } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_ENV, type AppEnv } from '../../common/config/env';
import { maskEmail, senderOf, type MailMessage, type MailProvider } from './mail.provider';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
const REQUEST_TIMEOUT_MS = 10_000;

/** En-tête encodé RFC 2047 (accents dans le sujet ou le nom d'expéditeur). */
function encodeHeader(value: string): string {
  return /^[\x20-\x7e]*$/.test(value)
    ? value
    : `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

/** Corps encodé en base64, découpé en lignes de 76 caractères (RFC 2045). */
function base64Body(value: string): string {
  return (
    Buffer.from(value, 'utf8')
      .toString('base64')
      .match(/.{1,76}/g)
      ?.join('\r\n') ?? ''
  );
}

/** Message MIME complet (texte + HTML) prêt pour l'API Gmail. */
export function buildMime(
  message: MailMessage,
  from: { email: string; name: string },
  replyTo?: string,
): string {
  const boundary = `bailo-${randomBytes(12).toString('hex')}`;
  const headers = [
    `From: ${encodeHeader(from.name)} <${from.email}>`,
    `To: ${message.to}`,
    ...(replyTo ? [`Reply-To: ${replyTo}`] : []),
    `Subject: ${encodeHeader(message.subject)}`,
    'MIME-Version: 1.0',
  ];
  const textPart = [
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    base64Body(message.text),
  ];
  if (!message.html) {
    return [...headers, ...textPart].join('\r\n');
  }
  return [
    ...headers,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    ...textPart,
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    base64Body(message.html),
    `--${boundary}--`,
  ].join('\r\n');
}

/**
 * Envoi depuis un compte Gmail via l'**API Gmail** (HTTPS), et non par SMTP :
 * Railway bloque le SMTP sortant hors offre Pro. L'autorisation est un jeton de
 * rafraîchissement OAuth (portée `gmail.send` uniquement), obtenu une seule fois
 * avec `scripts/gmail-refresh-token.mjs`.
 *
 * Variables : GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, et
 * EMAIL_FROM = l'adresse Gmail autorisée (ou un alias configuré dans Gmail).
 */
@Injectable()
export class GmailMailProvider implements MailProvider {
  private readonly logger = new Logger('Mail');
  private accessToken: { value: string; expiresAtMs: number } | null = null;

  constructor(@Inject(APP_ENV) private readonly env: AppEnv) {}

  /** Jeton d'accès (≈ 1 h), mis en cache et renouvelé une minute avant expiration. */
  private async token(): Promise<string> {
    if (this.accessToken && this.accessToken.expiresAtMs > Date.now() + 60_000) {
      return this.accessToken.value;
    }
    const { GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN } = this.env;
    if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN) {
      throw new Error(
        'Gmail : GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET et GMAIL_REFRESH_TOKEN sont requis',
      );
    }
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GMAIL_CLIENT_ID,
        client_secret: GMAIL_CLIENT_SECRET,
        refresh_token: GMAIL_REFRESH_TOKEN,
        grant_type: 'refresh_token',
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const data = (await res.json().catch(() => ({}))) as {
      access_token?: string;
      expires_in?: number;
      error?: string;
      error_description?: string;
    };
    if (!res.ok || !data.access_token) {
      // invalid_grant : jeton révoqué ou expiré (appli Google restée en mode « Test » : 7 jours).
      const reason = data.error_description ?? data.error ?? `HTTP ${res.status}`;
      throw new Error(`Gmail : autorisation refusée (${reason}) — regénérer GMAIL_REFRESH_TOKEN`);
    }
    this.accessToken = {
      value: data.access_token,
      expiresAtMs: Date.now() + (data.expires_in ?? 3600) * 1000,
    };
    return data.access_token;
  }

  async send(message: MailMessage): Promise<void> {
    const mime = buildMime(message, senderOf(this.env), this.env.EMAIL_REPLY_TO);
    const res = await fetch(SEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await this.token()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: Buffer.from(mime, 'utf8').toString('base64url') }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (res.status === 401) this.accessToken = null; // jeton d'accès révoqué : on en redemandera un
    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 200);
      throw new Error(
        `Gmail a refusé l'e-mail vers ${maskEmail(message.to)} (HTTP ${res.status}) ${detail}`.trim(),
      );
    }
    this.logger.log(`E-mail envoyé via Gmail → ${maskEmail(message.to)}`);
  }
}
