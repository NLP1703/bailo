import { SyncEngine } from '@bailo/sync';
import * as Crypto from 'expo-crypto';
import { getDatabase } from '../db/database';
import { SqliteOutboxStore, SqlitePullStore } from '../db/stores';
import { getSecret, setSecret } from '../lib/secure';
import { transport } from './transport';

export interface SyncContext {
  engine: SyncEngine;
  outbox: SqliteOutboxStore;
  data: SqlitePullStore;
}

let current: Promise<SyncContext> | null = null;

/** Identifiant de ce téléphone, créé une fois et gardé dans le trousseau (§ 11). */
export async function getDeviceId(): Promise<string> {
  const existing = await getSecret('deviceId');
  if (existing) return existing;
  const id = Crypto.randomUUID();
  await setSecret('deviceId', id);
  return id;
}

/** Moteur unique pour la session ouverte. */
export function getSync(): Promise<SyncContext> {
  current ??= (async () => {
    const db = await getDatabase();
    const outbox = new SqliteOutboxStore(db);
    const data = new SqlitePullStore(db);
    const engine = new SyncEngine({
      outbox,
      pullStore: data,
      transport,
      deviceId: await getDeviceId(),
      uuid: () => Crypto.randomUUID(),
    });
    await engine.refreshPendingCount();
    return { engine, outbox, data };
  })().catch((error: unknown) => {
    current = null;
    throw error;
  });
  return current;
}

/** À la déconnexion : arrête les tentatives et oublie le moteur. */
export async function resetSync(): Promise<void> {
  const ctx = await current?.catch(() => null);
  ctx?.engine.stop();
  current = null;
}
