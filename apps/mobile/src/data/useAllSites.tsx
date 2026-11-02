import { useEffect, useMemo, useState } from 'react';
import { useSession } from '../lib/session';
import { getSync } from '../sync/engine';
import { useSyncState } from '../sync/useSync';
import { buildUnitViews, siteSummary, withPending, type QueuedOp, type SiteSummary } from './derive';
import type { SiteTables } from './types';

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

const emptyTables = Object.fromEntries(TABLES.map((t) => [t, []])) as unknown as SiteTables;

const EMPTY_SUMMARY: SiteSummary = {
  collectedToday: 0,
  paymentsToday: 0,
  collectedMonth: 0,
  expectedMonth: 0,
  toCollectUnits: 0,
  toCollectMonth: 0,
  overdue: 0,
  overdueUnits: 0,
  occupied: 0,
  total: 0,
};

/** Somme champ par champ : chaque indicateur d'un site s'ajoute (NF7 : même compte). */
function addSummary(a: SiteSummary, b: SiteSummary): SiteSummary {
  return {
    collectedToday: a.collectedToday + b.collectedToday,
    paymentsToday: a.paymentsToday + b.paymentsToday,
    collectedMonth: a.collectedMonth + b.collectedMonth,
    expectedMonth: a.expectedMonth + b.expectedMonth,
    toCollectUnits: a.toCollectUnits + b.toCollectUnits,
    toCollectMonth: a.toCollectMonth + b.toCollectMonth,
    overdue: a.overdue + b.overdue,
    overdueUnits: a.overdueUnits + b.overdueUnits,
    occupied: a.occupied + b.occupied,
    total: a.total + b.total,
  };
}

export interface SiteOverview {
  id: string;
  name: string;
  summary: SiteSummary;
}

export interface AllSitesData {
  loading: boolean;
  sites: SiteOverview[];
  total: SiteSummary;
}

type RawBySite = Record<string, { tables: SiteTables; queue: QueuedOp[] }>;

/**
 * Vue d'ensemble du propriétaire (T13) : indicateurs de chacun de ses sites, lus dans la
 * base locale (donc sans réseau) et agrégés. Les sites sont réceptionnés par le moteur de
 * synchronisation (voir `useSync`) ; ici on ne fait que lire et additionner.
 */
export function useAllSites(): AllSitesData {
  const { user } = useSession();
  const sync = useSyncState();
  const siteList = useMemo(() => user?.sites ?? [], [user?.sites]);
  const siteKey = siteList.map((s) => s.id).join(',');
  const [raw, setRaw] = useState<RawBySite | null>(null);

  useEffect(() => {
    if (siteList.length === 0) return;
    let cancelled = false;
    void (async () => {
      const { data, outbox } = await getSync();
      const queue = await outbox.pending(1000);
      const entries = await Promise.all(
        siteList.map(async (site) => {
          const lists = await Promise.all(TABLES.map((t) => data.list(site.id, t)));
          const tables = Object.fromEntries(
            TABLES.map((t, i) => [t, lists[i]]),
          ) as unknown as SiteTables;
          return [site.id, { tables, queue: queue.filter((op) => op.siteId === site.id) }] as const;
        }),
      );
      if (!cancelled) setRaw(Object.fromEntries(entries));
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [siteKey, sync.lastSuccessAt, sync.pendingCount]);

  return useMemo<AllSitesData>(() => {
    const today = new Date();
    const sites = siteList.map((site) => {
      const bySite = raw?.[site.id];
      const tables = bySite ? withPending(bySite.tables, bySite.queue) : emptyTables;
      const views = buildUnitViews(tables, today);
      return { id: site.id, name: site.name, summary: siteSummary(tables, views, today) };
    });
    const total = sites.reduce((acc, s) => addSummary(acc, s.summary), EMPTY_SUMMARY);
    return { loading: raw === null, sites, total };
  }, [raw, siteList]);
}
