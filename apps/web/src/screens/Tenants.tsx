import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { formatDate } from '../lib/format';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/Confirm';
import { PageHeader, EmptyState, PageSkeleton, Button } from '../components/ui';
import {
  DataTable,
  FilterChips,
  Money,
  SearchField,
  StatusBadge,
  TableToolbar,
  statusDotClass,
  type Column,
  type StatusKind,
} from '../components/data';
import { UsersIcon, UserPlusIcon, ChevronRightIcon } from '../components/icons';

type Status = 'ACTIVE' | 'NOTICE' | 'CLOSED' | 'ARCHIVED';
type Color = 'GREEN' | 'ORANGE' | 'RED' | 'GREY' | 'BLUE';

interface Reservation {
  unitId: string;
  unitCode: string;
  siteId: string;
  siteName: string;
  reservedFor: string | null;
  reservedUntil: string | null;
  daysUntil: number | null;
  isExpired: boolean;
  isToday: boolean;
}

interface EnrichedTenant {
  id: string;
  name: string;
  phone: string | null;
  photoKey: string | null;
  occupation: string | null;
  status: Status;
  color: Color;
  siteName: string | null;
  unitCode: string | null;
  totalPaid: number;
  remaining: number;
  monthsCoveredLabel: string | null;
  advanceMonths: number;
  nextDueDate: string | null;
  nextDueAmount: number | null;
  depositExpected: number;
  depositPaid: number;
  activeOccupancyId: string | null;
}

type FilterKey = 'all' | 'active' | 'overdue' | 'upcoming' | 'advance' | 'notice' | 'closed' | 'archived';

/** Statut unifié affiché pour un locataire (une seule règle, partout). */
function statusOf(tn: EnrichedTenant): StatusKind {
  if (tn.status === 'CLOSED' || tn.status === 'ARCHIVED') return 'closed';
  if (tn.color === 'RED') return 'overdue';
  if (tn.color === 'ORANGE') return 'dueSoon';
  if (tn.status === 'NOTICE') return 'notice';
  if (tn.advanceMonths > 0) return 'advance';
  if (tn.color === 'BLUE') return 'reserved';
  return 'upToDate';
}

function depositIncomplete(tn: EnrichedTenant): boolean {
  return tn.depositExpected > 0 && tn.depositPaid < tn.depositExpected;
}

export function Tenants() {
  const { t } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [rows, setRows] = useState<EnrichedTenant[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);

  const loadReservations = () => {
    api
      .get<Reservation[]>('/reservations')
      .then(setReservations)
      .catch(() => setReservations([]));
  };
  useEffect(loadReservations, []);

  const cancelReservation = async (r: Reservation) => {
    const ok = await confirm({
      title: t('confirm.cancelReservationTitle', { unit: r.unitCode }),
      message: t('confirm.cancelReservationMsg', { name: r.reservedFor ?? '—' }),
      confirmLabel: t('confirm.cancelReservationOk'),
      cancelLabel: t('confirm.keep'),
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api.post(`/units/${r.unitId}/unreserve`, {});
      toast.success(t('confirm.reservationCancelled', { unit: r.unitCode }));
      loadReservations();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  useEffect(() => {
    const id = setTimeout(() => {
      setLoading(true);
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      // « Archivés » n'est pas un statut d'occupation : c'est un drapeau du locataire.
      if (filter === 'archived') params.set('archived', 'true');
      else if (filter !== 'all') params.set('status', filter);
      api
        .get<EnrichedTenant[]>(`/tenants${params.toString() ? `?${params.toString()}` : ''}`)
        .then(setRows)
        .catch(() => setRows([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(id);
  }, [q, filter]);

  // Compteurs des pastilles, calculés sur la liste complète (sans filtre de statut).
  const [allRows, setAllRows] = useState<EnrichedTenant[]>([]);
  const [archivedCount, setArchivedCount] = useState(0);
  useEffect(() => {
    api.get<EnrichedTenant[]>('/tenants').then(setAllRows).catch(() => setAllRows([]));
    api
      .get<EnrichedTenant[]>('/tenants?archived=true')
      .then((r) => setArchivedCount(r.length))
      .catch(() => setArchivedCount(0));
  }, []);
  const counts = useMemo(() => {
    const c = {
      all: allRows.length, active: 0, overdue: 0, upcoming: 0, advance: 0, notice: 0, closed: 0,
      archived: archivedCount,
    };
    for (const tn of allRows) {
      if (tn.status === 'ACTIVE') c.active += 1;
      if (tn.status === 'NOTICE') c.notice += 1;
      if (tn.status === 'CLOSED') c.closed += 1;
      if (tn.color === 'RED') c.overdue += 1;
      if (tn.color === 'ORANGE') c.upcoming += 1;
      if (tn.advanceMonths > 0) c.advance += 1;
    }
    return c;
  }, [allRows, archivedCount]);

  const chipDot: Partial<Record<FilterKey, string>> = {
    advance: statusDotClass('advance'),
    upcoming: statusDotClass('dueSoon'),
    overdue: statusDotClass('overdue'),
    notice: statusDotClass('notice'),
    closed: statusDotClass('closed'),
  };
  const chipKeys: FilterKey[] = ['all', 'active', 'overdue', 'upcoming', 'advance', 'notice', 'closed'];
  // La pastille « Archivés » n'apparaît que s'il y en a (ou si elle est sélectionnée).
  if (counts.archived > 0 || filter === 'archived') chipKeys.push('archived');
  const chips = chipKeys.map(
    (k) => ({ key: k, label: t(`lists.filter.${k}`), count: counts[k], dot: chipDot[k] }),
  );

  const columns: Column<EnrichedTenant>[] = [
    {
      key: 'name',
      header: t('table.tenant'),
      sortValue: (r) => r.name,
      cell: (r) => (
        <span className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
            {r.name.charAt(0).toUpperCase()}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-semibold text-slate-900">{r.name}</span>
            <span className="block truncate text-xs text-slate-500">{r.phone ?? '—'}</span>
          </span>
        </span>
      ),
    },
    {
      key: 'unit',
      header: t('table.unit'),
      sortValue: (r) => r.unitCode,
      cell: (r) =>
        r.unitCode ? (
          <span>
            <span className="font-semibold text-slate-800">{r.unitCode}</span>
            <span className="block text-xs text-slate-500">{r.siteName}</span>
          </span>
        ) : (
          <span className="text-slate-400">—</span>
        ),
    },
    {
      key: 'status',
      header: t('table.status'),
      sortValue: (r) => ['overdue', 'dueSoon', 'notice', 'upToDate', 'advance', 'reserved', 'closed'].indexOf(statusOf(r)),
      cell: (r) => (
        <span className="flex flex-col items-start gap-1">
          <StatusBadge kind={statusOf(r)} />
          {depositIncomplete(r) && (
            <span className="text-[11px] font-medium text-amber-700">{t('lists.depositIncomplete')}</span>
          )}
        </span>
      ),
    },
    {
      key: 'paid',
      header: t('table.paid'),
      align: 'right',
      sortValue: (r) => r.totalPaid,
      cell: (r) => <Money value={r.totalPaid} />,
    },
    {
      key: 'remaining',
      header: t('table.remaining'),
      align: 'right',
      sortValue: (r) => r.remaining,
      cell: (r) =>
        r.remaining > 0 ? <Money value={r.remaining} tone="negative" /> : <span className="text-slate-400">—</span>,
    },
    {
      key: 'next',
      header: t('table.nextDue'),
      align: 'right',
      sortValue: (r) => r.nextDueDate,
      cell: (r) =>
        r.nextDueDate ? (
          <span className="tabular-nums">
            <span className="block text-slate-800">{formatDate(r.nextDueDate)}</span>
            {r.monthsCoveredLabel && (
              <span className="block text-xs text-slate-500">{r.monthsCoveredLabel}</span>
            )}
          </span>
        ) : (
          <span className="text-slate-400">—</span>
        ),
    },
    {
      key: 'go',
      header: <span className="sr-only">{t('nav.crumb.tenant')}</span>,
      align: 'right',
      className: 'w-10',
      cell: () => <ChevronRightIcon className="ml-auto h-4 w-4 text-slate-300" />,
    },
  ];

  const mobileCard = (tn: EnrichedTenant) => (
    <Link to={`/tenants/${tn.id}`} className="flex items-center gap-3 p-4 transition hover:bg-slate-50">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-600">
        {tn.name.charAt(0).toUpperCase()}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate font-semibold text-slate-900">{tn.name}</span>
          <StatusBadge kind={statusOf(tn)} />
        </span>
        <span className="mt-0.5 block truncate text-xs text-slate-500">
          {[tn.unitCode, tn.siteName].filter(Boolean).join(' · ') || '—'}
        </span>
        <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
          <span className="text-slate-500">
            {t('table.paid')} <Money value={tn.totalPaid} className="text-xs" />
          </span>
          {tn.remaining > 0 && (
            <span className="text-slate-500">
              {t('table.remaining')} <Money value={tn.remaining} tone="negative" className="text-xs" />
            </span>
          )}
          {tn.nextDueDate && (
            <span className="text-slate-500">
              {t('table.nextDue')} <span className="tabular-nums text-slate-700">{formatDate(tn.nextDueDate)}</span>
            </span>
          )}
        </span>
      </span>
      <ChevronRightIcon className="h-5 w-5 shrink-0 text-slate-300" />
    </Link>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('tenants.title')}
        subtitle={t('pageSub.tenants')}
        actions={
          <Link
            to="/new-entry"
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-dark"
          >
            <UserPlusIcon className="h-4 w-4" />
            {t('tenants.add')}
          </Link>
        }
      />

      {/* Chambres réservées — visible seulement s'il y en a */}
      {reservations.length > 0 && (
        <section className="overflow-hidden rounded-xl bg-white shadow-card ring-1 ring-sky-200">
          <h2 className="flex items-center gap-2 border-b border-sky-100 bg-sky-50/60 px-4 py-2.5 text-sm font-semibold text-slate-900">
            <span className="h-2 w-2 rounded-full bg-sky-500" />
            {t('lists.reservations')}
            <span className="rounded-md bg-sky-100 px-1.5 text-xs font-semibold text-sky-700">
              {reservations.length}
            </span>
          </h2>
          <ul className="divide-y divide-slate-100">
            {reservations.map((r) => {
              const dayLabel = r.isExpired
                ? `expirée il y a ${Math.abs(r.daysUntil ?? 0)} j`
                : r.isToday
                  ? "arrive aujourd'hui"
                  : r.daysUntil === 1
                    ? 'arrive demain'
                    : r.daysUntil !== null
                      ? `arrive dans ${r.daysUntil} j`
                      : 'date non définie';
              const dayClass = r.isExpired
                ? 'text-red-700'
                : r.isToday
                  ? 'text-emerald-700'
                  : (r.daysUntil ?? 99) <= 3
                    ? 'text-amber-700'
                    : 'text-sky-700';
              return (
                <li key={r.unitId} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                  <span className="flex h-9 min-w-[2.25rem] shrink-0 items-center justify-center rounded-lg bg-sky-50 px-1.5 text-xs font-bold text-sky-700 ring-1 ring-inset ring-sky-200">
                    {r.unitCode}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-slate-800">
                      {r.reservedFor ?? '(sans nom)'}
                    </span>
                    <span className={`block text-xs font-medium ${dayClass}`}>
                      {r.siteName} · {dayLabel}
                    </span>
                  </span>
                  <span className="flex shrink-0 gap-2">
                    <Link
                      to={`/new-entry?unitId=${r.unitId}`}
                      className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-dark"
                    >
                      {t('lists.confirmArrival')}
                    </Link>
                    <button
                      onClick={() => void cancelReservation(r)}
                      className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-inset ring-slate-200 transition hover:bg-slate-50"
                      aria-label={`Annuler la réservation de ${r.unitCode}`}
                    >
                      {t('lists.cancelReservation')}
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="space-y-3">
        <TableToolbar
          count={loading ? t('common.loading') : t('table.results', { count: rows.length })}
        >
          <SearchField value={q} onChange={setQ} placeholder={t('tenants.search')} />
        </TableToolbar>
        <FilterChips options={chips} value={filter} onChange={setFilter} ariaLabel={t('table.status')} />
      </div>

      {loading && rows.length === 0 ? (
        <PageSkeleton variant="rows" />
      ) : rows.length === 0 ? (
        q || filter !== 'all' ? (
          <EmptyState
            icon={UsersIcon}
            title={t('empty.noMatchTitle')}
            message={t('empty.noMatchMsg')}
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setQ('');
                  setFilter('all');
                }}
              >
                {t('empty.resetFilters')}
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={UsersIcon}
            title={t('empty.noTenantsTitle')}
            message={t('empty.noTenantsMsg')}
            action={
              <Link
                to="/new-entry"
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-dark"
              >
                <UserPlusIcon className="h-4 w-4" />
                {t('tenants.add')}
              </Link>
            }
          />
        )
      ) : (
        <DataTable
          caption={t('tenants.title')}
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          rowHref={(r) => `/tenants/${r.id}`}
          mobileCard={mobileCard}
        />
      )}
    </div>
  );
}
