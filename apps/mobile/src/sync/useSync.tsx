import type { SyncState } from '@bailo/sync';
import * as Network from 'expo-network';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { PULL_INTERVAL_MS } from '../lib/config';
import { useSession } from '../lib/session';
import { getSync } from './engine';

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
  const siteId = user?.siteId ?? null;

  useEffect(() => {
    if (status !== 'ready' || !siteId) return;
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    const run = () =>
      void getSync()
        .then(({ engine }) => engine.syncNow(siteId))
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
  }, [status, siteId]);

  return <SyncStateContext.Provider value={state}>{children}</SyncStateContext.Provider>;
}

export function useSyncState(): SyncState {
  return useContext(SyncStateContext);
}
