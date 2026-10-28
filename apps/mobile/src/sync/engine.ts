import { SyncEngine } from '@bailo/sync';
import * as Crypto from 'expo-crypto';
import { getDatabase } from '../db/database';
import { SqliteOutboxStore, SqlitePullStore } from '../db/stores';
import { Platform } from 'react-native';
import { api, setDeviceKey } from '../lib/api';
import { APP_VERSION } from '../lib/config';
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
  const id = existing ?? Crypto.randomUUID();
  if (!existing) await setSecret('deviceId', id);
  setDeviceKey(id);
  return id;
}

export interface RegisteredDevice {
  id: string;
  deviceId: string;
  userName: string;
  platform: string;
  model: string | null;
  lastSeenAt: string;
}

/**
 * Enregistre ce téléphone sur le compte (RGM10). Deux appareils actifs au plus :
 * au-delà, l'API répond DEVICE_LIMIT_REACHED avec la liste, et `replaceDeviceId`
 * désigne celui à déconnecter.
 */
export async function registerDevice(replaceDeviceId?: string): Promise<RegisteredDevice> {
  return api.post<RegisteredDevice>('/auth/device', {
    deviceId: await getDeviceId(),
    platform: Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web',
    appVersion: APP_VERSION,
    ...(replaceDeviceId ? { replaceDeviceId } : {}),
  });
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
