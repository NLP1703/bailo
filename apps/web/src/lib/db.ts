import Dexie, { type Table } from 'dexie';
import type { CreatePaymentDto } from '@bailo/shared';

/** Paiement saisi hors-ligne, en attente d'envoi (NF3). */
export interface OutboxPayment {
  clientId: string;
  body: CreatePaymentDto;
  createdAt: number;
}

export interface CachedUnit {
  id: string;
  siteId: string;
  code: string;
  [k: string]: unknown;
}
export interface CachedTenant {
  id: string;
  name: string;
  [k: string]: unknown;
}

class BailoDb extends Dexie {
  units!: Table<CachedUnit, string>;
  tenants!: Table<CachedTenant, string>;
  outbox!: Table<OutboxPayment, string>;
  meta!: Table<{ key: string; value: string }, string>;

  constructor() {
    super('bailo');
    this.version(1).stores({
      units: 'id, siteId',
      tenants: 'id',
      outbox: 'clientId, createdAt',
      meta: 'key',
    });
  }
}

export const db = new BailoDb();
