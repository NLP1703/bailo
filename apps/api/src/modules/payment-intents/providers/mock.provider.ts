// Provider "mock" : accepte toute requête, ne contacte aucun opérateur.
// Utile pour développer et seeder la démo ; le succès/échec peut être simulé
// via un endpoint interne qui pousse un webhook factice.

import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import {
  PaymentCollectProvider,
  type InitiateCollectInput,
  type InitiateCollectResult,
  type WebhookEvent,
} from './provider';
import type { PaymentProvider as ProviderName } from '@prisma/client';

const MOCK_SECRET = process.env.MOCK_PROVIDER_SECRET ?? 'bailo-mock-dev-secret';

@Injectable()
export class MockCollectProvider extends PaymentCollectProvider {
  readonly name: ProviderName = 'MOCK';
  private readonly log = new Logger('MockCollectProvider');

  async initiate(input: InitiateCollectInput): Promise<InitiateCollectResult> {
    const ref = `mock_${randomUUID().slice(0, 8)}`;
    this.log.log(`initiate ${ref} amount=${input.amount} phone=${input.phone}`);
    return { providerRef: ref, status: 'INITIATED', statusMessage: 'En attente du client' };
  }

  parseWebhook(headers: Record<string, string>, rawBody: string): WebhookEvent | null {
    const sig = headers['x-bailo-signature'] ?? headers['X-Bailo-Signature'];
    if (!sig) return null;
    const expected = createHmac('sha256', MOCK_SECRET).update(rawBody).digest('hex');
    const a = Buffer.from(sig, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    try {
      const data = JSON.parse(rawBody) as {
        providerRef: string;
        status: 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
        statusMessage?: string;
      };
      return {
        providerRef: data.providerRef,
        status: data.status,
        statusMessage: data.statusMessage,
        rawPayload: data,
      };
    } catch {
      return null;
    }
  }

  /** Utilitaire interne : construit la signature attendue pour l'endpoint /simulate. */
  static sign(body: string): string {
    return createHmac('sha256', MOCK_SECRET).update(body).digest('hex');
  }
}
