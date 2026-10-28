import type { PullPage, PushRequest, PushResponse, SyncTransport } from '@bailo/sync';
import { api, ApiError } from '../lib/api';

let onRevoked: (() => void) | null = null;
let reRegister: (() => Promise<unknown>) | null = null;

/**
 * Branchements fournis par la session : que faire si le propriétaire a déconnecté ce
 * téléphone (RGM12), et comment le réenregistrer si le serveur ne le connaît pas.
 */
export function configureTransport(handlers: {
  onDeviceRevoked: () => void;
  register: () => Promise<unknown>;
}): void {
  onRevoked = handlers.onDeviceRevoked;
  reRegister = handlers.register;
}

async function withDevice<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (error instanceof ApiError && error.code === 'SYNC_DEVICE_UNKNOWN' && reRegister) {
      await reRegister();
      return call();
    }
    if (error instanceof ApiError && error.code === 'SYNC_DEVICE_REVOKED') onRevoked?.();
    throw error;
  }
}

/** Ancienne réponse de `/sync/pull` (avant la version par site du protocole). */
interface LegacyPull {
  serverTime: string;
  [table: string]: unknown;
}

const LEGACY_TABLES = [
  'sites',
  'blocks',
  'units',
  'tenants',
  'guarantors',
  'occupancies',
  'charges',
  'payments',
] as const;

/**
 * Accès réseau du moteur. Une API plus ancienne qui renverrait l'instantané du compte
 * (sans `changes`) est convertie en une page unique.
 */
export const transport: SyncTransport = {
  async push(request: PushRequest): Promise<PushResponse> {
    const response = await withDevice(() =>
      api.post<PushResponse & { deviceRevoked?: boolean }>('/sync/push', request),
    );
    // Les saisies d'avant la déconnexion viennent de partir : l'app peut s'effacer.
    if (response.deviceRevoked) setTimeout(() => onRevoked?.(), 0);
    return response;
  },

  async pull(siteId: string, cursor: string | null): Promise<PullPage> {
    const query = new URLSearchParams({ siteId });
    if (cursor) {
      query.set('cursor', cursor);
      query.set('since', cursor);
    }
    const data = await withDevice(() =>
      api.get<PullPage | LegacyPull>(`/sync/pull?${query.toString()}`),
    );
    if ('changes' in data && 'cursor' in data) return data as PullPage;
    const legacy = data as LegacyPull;
    const changes: Record<string, unknown[]> = {};
    for (const table of LEGACY_TABLES) {
      const rows = legacy[table];
      if (Array.isArray(rows)) changes[table] = rows;
    }
    return { changes, tombstones: {}, cursor: legacy.serverTime, hasMore: false };
  },
};
