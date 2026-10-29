import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useSession } from '../lib/session';
import { getSync } from '../sync/engine';
import { useSyncState } from '../sync/useSync';
import {
  buildUnitViews,
  siteSummary,
  withPending,
  type QueuedOp,
  type SiteSummary,
} from './derive';
import type { SiteTables, UnitView } from './types';

const TABLES: Array<keyof SiteTables> = [
  'sites',
  'blocks',
  'units',
  'tenants',
  'guarantors',
  'occupancies',
  'charges',
  'payments',
  'meters',
  'meter_readings',
  'tickets',
  'expenses',
  'cash_handovers',
];

export interface SiteData {
  siteId: string | null;
  loading: boolean;
  /** Le téléphone n'a encore rien reçu pour ce site (premier lancement sans réseau). */
  empty: boolean;
  tables: SiteTables;
  queue: QueuedOp[];
  units: UnitView[];
  summary: SiteSummary;
  reload: () => void;
}

const emptyTables = Object.fromEntries(TABLES.map((t) => [t, []])) as unknown as SiteTables;

const SiteDataContext = createContext<SiteData | null>(null);

/**
 * Données du site courant, lues dans la base locale : tout reste consultable sans réseau.
 * Relues après chaque réception et chaque saisie (changement d'état de la synchro).
 */
export function SiteDataProvider({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const siteId = user?.siteId ?? null;
  const sync = useSyncState();
  const [raw, setRaw] = useState<{ tables: SiteTables; queue: QueuedOp[] } | null>(null);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!siteId) return;
    let cancelled = false;
    void (async () => {
      const { data, outbox } = await getSync();
      const lists = await Promise.all(TABLES.map((t) => data.list(siteId, t)));
      const queue = await outbox.pending(1000);
      if (cancelled) return;
      setRaw({
        tables: Object.fromEntries(TABLES.map((t, i) => [t, lists[i]])) as unknown as SiteTables,
        queue: queue.filter((op) => op.siteId === siteId),
      });
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [siteId, version, sync.lastSuccessAt, sync.pendingCount]);

  const value = useMemo<SiteData>(() => {
    const today = new Date();
    const tables = raw ? withPending(raw.tables, raw.queue) : emptyTables;
    const units = buildUnitViews(tables, today);
    return {
      siteId,
      loading: raw === null,
      empty: raw !== null && raw.tables.units.length === 0,
      tables,
      queue: raw?.queue ?? [],
      units,
      summary: siteSummary(tables, units, today),
      reload,
    };
  }, [raw, siteId, reload]);

  return <SiteDataContext.Provider value={value}>{children}</SiteDataContext.Provider>;
}

export function useSiteData(): SiteData {
  const value = useContext(SiteDataContext);
  if (!value) throw new Error('useSiteData hors de SiteDataProvider');
  return value;
}
