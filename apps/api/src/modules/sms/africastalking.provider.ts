import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_ENV, type AppEnv } from '../../common/config/env';
import type { SmsProvider } from './sms.provider';

/** Indicatif par défaut pour les numéros saisis sans indicatif (Cameroun). */
const DEFAULT_COUNTRY_CODE = '237';
/** Codes « accepté » renvoyés par Africa's Talking pour un destinataire (Processed, Sent, Queued). */
const ACCEPTED_STATUS_CODES = new Set([100, 101, 102]);
const REQUEST_TIMEOUT_MS = 10_000;

interface AtRecipient {
  number?: string;
  status?: string;
  statusCode?: number;
  messageId?: string;
}
interface AtResponse {
  SMSMessageData?: { Message?: string; Recipients?: AtRecipient[] };
}

/**
 * Normalise un numéro au format international E.164 attendu par Africa's Talking.
 * « 690000000 » → « +237690000000 » ; « 00237… » / « 237… » / « +237… » conservés.
 */
export function toE164(phone: string, countryCode = DEFAULT_COUNTRY_CODE): string {
  const trimmed = phone.trim();
  if (trimmed.startsWith('+')) return `+${trimmed.slice(1).replace(/\D/g, '')}`;
  let digits = trimmed.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  // Numéro national camerounais (9 chiffres) : on préfixe l'indicatif.
  if (digits.length === 9) digits = `${countryCode}${digits}`;
  return `+${digits}`;
}

/** Masque un numéro pour les journaux (NF8) : seuls les 2 derniers chiffres restent visibles. */
function mask(phone: string): string {
  return phone.replace(/.(?=.{2})/g, '•');
}

/**
 * Envoi SMS via Africa's Talking (8.1) — API REST « bulk messaging ».
 *
 * Variables : `SMS_USERNAME` (nom d'application, `sandbox` pour le bac à sable),
 * `SMS_API_KEY`, `SMS_SENDER_ID` (optionnel, identifiant d'expéditeur validé).
 * Le contenu des messages (OTP) n'est jamais journalisé.
 */
@Injectable()
export class AfricasTalkingSmsProvider implements SmsProvider {
  private readonly logger = new Logger('SMS');

  constructor(@Inject(APP_ENV) private readonly env: AppEnv) {}

  private get endpoint(): string {
    const sandbox = this.env.SMS_USERNAME?.toLowerCase() === 'sandbox';
    return `https://api.${sandbox ? 'sandbox.' : ''}africastalking.com/version1/messaging`;
  }

  async send(phone: string, message: string): Promise<void> {
    const username = this.env.SMS_USERNAME;
    const apiKey = this.env.SMS_API_KEY;
    if (!username || !apiKey) {
      throw new Error("Africa's Talking : SMS_USERNAME et SMS_API_KEY sont requis");
    }
    const to = toE164(phone);
    const body = new URLSearchParams({ username, to, message });
    if (this.env.SMS_SENDER_ID) body.set('from', this.env.SMS_SENDER_ID);

    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        apiKey,
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    // L'API répond 201 Created quand la demande est acceptée.
    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 200);
      throw new Error(`Africa's Talking a refusé l'envoi (HTTP ${res.status}) ${detail}`.trim());
    }
    const data = (await res.json().catch(() => ({}))) as AtResponse;
    const recipient = data.SMSMessageData?.Recipients?.[0];
    if (!recipient || !ACCEPTED_STATUS_CODES.has(recipient.statusCode ?? -1)) {
      const reason = recipient?.status ?? data.SMSMessageData?.Message ?? 'réponse inattendue';
      throw new Error(`Africa's Talking : envoi vers ${mask(to)} refusé (${reason})`);
    }
    this.logger.log(`SMS accepté → ${mask(to)} (${recipient.status ?? recipient.statusCode})`);
  }
}
