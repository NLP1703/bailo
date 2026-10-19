// Abstraction d'un provider de paiement mobile (MoMo, Orange Money).
// Chaque implémentation signe ses requêtes, encaisse via l'API Collect, et pousse
// un webhook signé que notre contrôleur vérifie pour clôturer l'intent.

import type { PaymentProvider as ProviderName } from '@prisma/client';

export interface InitiateCollectInput {
  intentId: string;
  phone: string;        // MSISDN international
  amount: number;       // FCFA
  currency: 'XAF' | 'EUR' | 'USD' | 'CAD' | 'GBP';
  callbackUrl: string;  // URL à laquelle le provider notifiera
  reference: string;    // référence lisible pour le relevé du client
}

export interface InitiateCollectResult {
  providerRef: string;              // id côté provider (sert à matcher le webhook)
  status: 'INITIATED' | 'FAILED';
  statusMessage?: string;
}

export interface WebhookEvent {
  providerRef: string;
  status: 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
  statusMessage?: string;
  rawPayload: unknown;
}

export abstract class PaymentCollectProvider {
  abstract readonly name: ProviderName;
  /** Initie la demande de prélèvement (prompt USSD côté client). */
  abstract initiate(input: InitiateCollectInput): Promise<InitiateCollectResult>;
  /** Vérifie la signature d'un webhook entrant et renvoie l'événement normalisé. */
  abstract parseWebhook(headers: Record<string, string>, rawBody: string): WebhookEvent | null;
}
