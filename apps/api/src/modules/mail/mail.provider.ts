import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_ENV, type AppEnv } from '../../common/config/env';

export const MAIL_PROVIDER = Symbol('MAIL_PROVIDER');

/** Un e-mail transactionnel (codes de vérification, notifications). */
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/** Contrat d'un fournisseur d'envoi d'e-mails. */
export interface MailProvider {
  send(message: MailMessage): Promise<void>;
}

/** Masque une adresse pour les journaux (NF8) : « ob•••@gmail.com ». */
export function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  return `${local.slice(0, 2)}${'•'.repeat(Math.max(1, local.length - 2))}@${domain}`;
}

/**
 * Implémentation factice de développement : n'envoie rien et journalise le sujet
 * (jamais le contenu, qui peut porter un code). Interdite en production.
 */
@Injectable()
export class ConsoleMailProvider implements MailProvider {
  private readonly logger = new Logger('Mail');

  constructor(@Inject(APP_ENV) private readonly env: AppEnv) {}

  async send(message: MailMessage): Promise<void> {
    if (this.env.NODE_ENV === 'production') {
      throw new Error('Fournisseur e-mail "console" interdit en production (EMAIL_PROVIDER)');
    }
    this.logger.debug(`→ ${maskEmail(message.to)} : ${message.subject}`);
  }
}

/** Expéditeur configuré (EMAIL_FROM / EMAIL_FROM_NAME). */
export function senderOf(env: AppEnv): { email: string; name: string } {
  if (!env.EMAIL_FROM) throw new Error('EMAIL_FROM est requis pour envoyer des e-mails');
  return { email: env.EMAIL_FROM, name: env.EMAIL_FROM_NAME };
}
