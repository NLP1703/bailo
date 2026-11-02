import { formatFcfa } from '@bailo/shared';
import { useEffect, useMemo, useState } from 'react';
import { useSession } from '../lib/session';
import { getSync } from '../sync/engine';
import { useSyncState } from '../sync/useSync';
import type { PaymentRow, SiteTables, TicketRow } from './types';

/** Tables nécessaires aux alertes du propriétaire. */
const TABLES: Array<keyof SiteTables> = [
  'units',
  'occupancies',
  'payments',
  'tickets',
  'cash_handovers',
];

const DAY = 86_400_000;
const OPEN_TICKET = new Set(['OPEN', 'ASSIGNED', 'IN_PROGRESS']);

export type AlertKind = 'payment' | 'void' | 'variance' | 'ticket';

export interface Alert {
  id: string;
  kind: AlertKind;
  title: string;
  detail: string;
  siteName: string;
  at: string;
}

type SiteSlice = Pick<SiteTables, (typeof TABLES)[number]>;

function alertsForSite(siteName: string, t: SiteSlice, now: number): Alert[] {
  const unitById = new Map(t.units.map((u) => [u.id, u.code]));
  const unitByOccupancy = new Map(t.occupancies.map((o) => [o.id, unitById.get(o.unitId) ?? '—']));
  const recent = new Date(now - 14 * DAY).toISOString();
  const out: Alert[] = [];

  for (const p of t.payments as PaymentRow[]) {
    if (p.paidAt < recent) continue;
    const unit = unitByOccupancy.get(p.occupancyId) ?? '—';
    if (p.status === 'VOIDED') {
      out.push({
        id: `void-${p.id}`,
        kind: 'void',
        title: 'Paiement annulé',
        detail: `Chambre ${unit} · ${formatFcfa(p.amount)}`,
        siteName,
        at: p.paidAt,
      });
    } else {
      out.push({
        id: `pay-${p.id}`,
        kind: 'payment',
        title: 'Paiement reçu',
        detail: `Chambre ${unit} · ${formatFcfa(p.amount)}`,
        siteName,
        at: p.paidAt,
      });
    }
  }

  for (const k of t.tickets as TicketRow[]) {
    if (k.priority !== 'URGENT' || !OPEN_TICKET.has(k.status)) continue;
    const unit = k.unitId ? (unitById.get(k.unitId) ?? null) : null;
    out.push({
      id: `tic-${k.id}`,
      kind: 'ticket',
      title: 'Panne urgente',
      detail: unit ? `${k.title} · chambre ${unit}` : k.title,
      siteName,
      at: k.reportedAt,
    });
  }

  return out;
}

/**
 * T16 — alertes du propriétaire : paiements reçus, écarts de caisse, pannes urgentes et
 * annulations, de tous ses sites, par ordre chronologique. Lues dans la base locale, donc
 * consultables sans réseau. Le montant des écarts est brut (le format FCFA est fait à l'écran).
 */
export function useAlerts(): { loading: boolean; alerts: Alert[] } {
  const { user } = useSession();
  const sync = useSyncState();
  const siteList = useMemo(() => user?.sites ?? [], [user?.sites]);
  const siteKey = siteList.map((s) => s.id).join(',');
  const [bySite, setBySite] = useState<Record<string, SiteSlice> | null>(null);

  useEffect(() => {
    if (siteList.length === 0) return;
    let cancelled = false;
    void (async () => {
      const { data } = await getSync();
      const entries = await Promise.all(
        siteList.map(async (site) => {
          const lists = await Promise.all(TABLES.map((t) => data.list(site.id, t)));
          const slice = Object.fromEntries(TABLES.map((t, i) => [t, lists[i]])) as SiteSlice;
          return [site.id, slice] as const;
        }),
      );
      if (!cancelled) setBySite(Object.fromEntries(entries));
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [siteKey, sync.lastSuccessAt, sync.pendingCount]);

  return useMemo(() => {
    const now = Date.now();
    const perSite = siteList.flatMap((site) => {
      const slice = bySite?.[site.id];
      return slice ? alertsForSite(site.name, slice, now) : [];
    });
    // Les remises de caisse ne dépendent pas d'un site (elles reviennent pour chaque
    // site) : on les traite une seule fois, à partir du premier site reçu, sans site.
    const firstSlice = bySite ? Object.values(bySite)[0] : undefined;
    const since60 = new Date(now - 60 * DAY).toISOString();
    const variances: Alert[] = (firstSlice?.cash_handovers ?? [])
      .filter((h) => h.variance !== 0 && h.createdAt >= since60)
      .map((h) => ({
        id: `var-${h.id}`,
        kind: 'variance' as const,
        title: 'Écart de caisse',
        detail: `${h.collectorName ?? 'Encaisseur'} · écart ${h.variance > 0 ? '+' : ''}${formatFcfa(h.variance)}`,
        siteName: '',
        at: h.createdAt,
      }));
    const alerts = [...perSite, ...variances]
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 80);
    return { loading: bySite === null, alerts };
  }, [bySite, siteList]);
}
