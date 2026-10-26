import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_ENV, type AppEnv } from '../../common/config/env';
import { maskEmail, senderOf, type MailMessage, type MailProvider } from './mail.provider';

const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Envoi par API HTTPS — Railway bloque le SMTP sortant hors offre Pro, et
 * recommande ces services transactionnels (https://docs.railway.com/networking/outbound-networking).
 */
async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

async function failure(provider: string, res: Response, to: string): Promise<Error> {
  const detail = (await res.text().catch(() => '')).slice(0, 200);
  return new Error(
    `${provider} a refusé l'e-mail vers ${maskEmail(to)} (HTTP ${res.status}) ${detail}`.trim(),
  );
}

function requireKey(env: AppEnv): string {
  if (!env.EMAIL_API_KEY) throw new Error('EMAIL_API_KEY est requis pour envoyer des e-mails');
  return env.EMAIL_API_KEY;
}

/**
 * Brevo (ex-Sendinblue) — offre gratuite de 300 e-mails/jour ; fonctionne avec une
 * simple adresse d'expéditeur vérifiée (pas besoin de nom de domaine).
 */
@Injectable()
export class BrevoMailProvider implements MailProvider {
  private readonly logger = new Logger('Mail');

  constructor(@Inject(APP_ENV) private readonly env: AppEnv) {}

  async send(message: MailMessage): Promise<void> {
    const res = await postJson(
      'https://api.brevo.com/v3/smtp/email',
      { 'api-key': requireKey(this.env) },
      {
        sender: senderOf(this.env),
        to: [{ email: message.to }],
        subject: message.subject,
        textContent: message.text,
        ...(message.html ? { htmlContent: message.html } : {}),
        ...(this.env.EMAIL_REPLY_TO ? { replyTo: { email: this.env.EMAIL_REPLY_TO } } : {}),
      },
    );
    if (!res.ok) throw await failure('Brevo', res, message.to);
    this.logger.log(`E-mail accepté → ${maskEmail(message.to)}`);
  }
}

/** Resend — offre gratuite de 3 000 e-mails/mois ; exige un nom de domaine vérifié. */
@Injectable()
export class ResendMailProvider implements MailProvider {
  private readonly logger = new Logger('Mail');

  constructor(@Inject(APP_ENV) private readonly env: AppEnv) {}

  async send(message: MailMessage): Promise<void> {
    const { email, name } = senderOf(this.env);
    const res = await postJson(
      'https://api.resend.com/emails',
      { Authorization: `Bearer ${requireKey(this.env)}` },
      {
        from: `${name} <${email}>`,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
        ...(this.env.EMAIL_REPLY_TO ? { reply_to: this.env.EMAIL_REPLY_TO } : {}),
      },
    );
    if (!res.ok) throw await failure('Resend', res, message.to);
    this.logger.log(`E-mail accepté → ${maskEmail(message.to)}`);
  }
}
