import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_ENV, type AppEnv } from '../../common/config/env';

export const SMS_PROVIDER = Symbol('SMS_PROVIDER');

/** Contrat d'un fournisseur d'envoi (OTP et, plus tard, relances SMS). */
export interface SmsProvider {
  send(phone: string, message: string): Promise<void>;
}

/**
 * Implémentation factice de développement : n'envoie rien, journalise le message.
 * ⚠️ Ne jamais logguer d'OTP en production (voir garde ci-dessous sur NODE_ENV).
 */
@Injectable()
export class ConsoleSmsProvider implements SmsProvider {
  private readonly logger = new Logger('SMS');

  constructor(@Inject(APP_ENV) private readonly env: AppEnv) {}

  async send(phone: string, message: string): Promise<void> {
    if (this.env.NODE_ENV === 'production') {
      // En prod, un vrai fournisseur doit être configuré : on refuse d'envoyer en clair.
      throw new Error('Fournisseur SMS "console" interdit en production');
    }
    const masked = phone.replace(/.(?=.{2})/g, '•');
    this.logger.debug(`→ ${masked} : ${message}`);
  }
}
