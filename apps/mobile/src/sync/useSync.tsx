import type { SyncState } from '@bailo/sync';
import * as Network from 'expo-network';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import { PULL_INTERVAL_MS } from '../lib/config';
import { useSession } from '../lib/session';
import { getSync } from './engine';
import { processUploads } from './photos';

const initial: SyncState = {
  phase: 'idle',
  pendingCount: 0,
  lastSuccessAt: null,
  lastError: null,
  nextRetryAt: null,
};

const SyncStateContext = createContext<SyncState>(initial);

/**
 * Déclencheurs de synchronisation (RGM2, RGM5) : à l'ouverture, au retour du réseau,
 * au retour au premier plan, puis toutes les 15 minutes en usage. Rien en arrière-plan (NFM5).
 */
export function SyncProvider({ children }: { children: ReactNode }) {
  const { status, user } = useSession();
  const [state, setState] = useState<SyncState>(initial);
  // Le propriétaire suit plusieurs sites : on les réceptionne tous (le gérant et le
  // gardien n'en ont qu'un). L'envoi est commun, la réception se fait site par site.
  const siteIds = useMemo(() => {
    const ids = user?.sites?.map((site) => site.id) ?? [];
    if (ids.length > 0) return ids;
    return user?.siteId ? [user.siteId] : [];
  }, [user?.sites, user?.siteId]);
  const siteKey = siteIds.join(',');

  useEffect(() => {
    if (status !== 'ready' || siteIds.length === 0) return;
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    // Envoi (commun), réception de chaque site, puis photos en attente (après les saisies).
    const run = () =>
      void getSync()
        .then(async ({ engine }) => {
          await engine.flush();
          for (const id of siteIds) await engine.pull(id);
        })
        .then(() => processUploads())
        .catch(() => undefined);

    void getSync().then(({ engine }) => {
      if (cancelled) return;
      unsubscribe = engine.subscribe(setState);
      run();
    });

    const net = Network.addNetworkStateListener((event) => {
      if (event.isConnected) run();
    });
    const app = AppState.addEventListener('change', (s) => {
      if (s === 'active') run();
    });
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') run();
    }, PULL_INTERVAL_MS);

    return () => {
      cancelled = true;
      unsubscribe?.();
      net.remove();
      app.remove();
      clearInterval(timer);
    };
  }, [status, siteKey]);

  return <SyncStateContext.Provider value={state}>{children}</SyncStateContext.Provider>;
}

export function useSyncState(): SyncState {
  return useContext(SyncStateContext);
}
