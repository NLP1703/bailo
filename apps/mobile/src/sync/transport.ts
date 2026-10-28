import type { PullPage, PushRequest, PushResponse, SyncTransport } from '@bailo/sync';
import { api } from '../lib/api';

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
 * Accès réseau du moteur. Tant que l'API n'a pas la version par site de `/sync/pull`
 * (prochaine étape de LM2), la réponse actuelle est convertie en une page unique.
 * Côté envoi, une API qui ne connaît pas encore le format multi-types ne renvoie aucun
 * résultat : le moteur le traite comme une erreur passagère et garde la file intacte.
 */
export const transport: SyncTransport = {
  push: (request: PushRequest) => api.post<PushResponse>('/sync/push', request),

  async pull(siteId: string, cursor: string | null): Promise<PullPage> {
    const query = new URLSearchParams({ siteId });
    if (cursor) {
      query.set('cursor', cursor);
      query.set('since', cursor);
    }
    const data = await api.get<PullPage | LegacyPull>(`/sync/pull?${query.toString()}`);
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
