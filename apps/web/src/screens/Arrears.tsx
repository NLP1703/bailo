import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, API } from '../lib/api';
import { formatDate } from '../lib/format';
import { PageHeader, Button, EmptyState, StatTile, PageSkeleton } from '../components/ui';
import {
  DataTable,
  FilterChips,
  Money,
  SearchField,
  TableToolbar,
  formatAmount,
  type Column,
} from '../components/data';
import { CheckCircleIcon, ClockAlertIcon, UsersIcon, BanknoteIcon, PrinterIcon } from '../components/icons';
import { PrintNote } from '../components/PrintLetterhead';
import { normalize } from '../app/navigation';

/** Télécharge un export en envoyant le jeton (un <a href> ne le ferait pas). */
async function downloadExport(path: string, filename: string): Promise<void> {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${localStorage.getItem('at') ?? ''}` },
  });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

interface ArrearRow {
  chargeId: string;
  tenantId: string;
  tenantName: string;
  tenantPhone: string | null;
  unitCode: string;
  siteName: string;
  type: string;
  dueDate: string;
  daysLate: number;
  remaining: number;
}

type LateKey = 'all' | 'l30' | 'l60' | 'l60plus';

function lateBucket(days: number): Exclude<LateKey, 'all'> {
  if (days <= 30) return 'l30';
  if (days <= 60) return 'l60';
  return 'l60plus';
}

/** Gravité visuelle du retard : plus c'est ancien, plus c'est marqué. */
function LateBadge({ days, label }: { days: number; label: string }) {
  const cls =
    days > 60
      ? 'bg-red-600 text-white ring-red-600'
      : days > 30
        ? 'bg-red-50 text-red-700 ring-red-200'
        : 'bg-amber-50 text-amber-700 ring-amber-200';
  return (
    <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums ring-1 ring-inset ${cls}`}>
      {label}
    </span>
  );
}

export function Arrears() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<ArrearRow[] | null>(null);
  const [q, setQ] = useState('');
  const [site, setSite] = useState('all');
  const [late, setLate] = useState<LateKey>('all');

  useEffect(() => {
    api
      .get<ArrearRow[]>('/reports/arrears')
      .then(setRows)
      .catch(() => setRows([]));
  }, []);

  const all = rows ?? [];
  const sites = useMemo(() => [...new Set(all.map((r) => r.siteName))].sort(), [all]);

  // Filtres combinés : recherche + cité + ancienneté.
  const filtered = useMemo(() => {
    const term = normalize(q.trim());
    return all.filter(
      (r) =>
        (site === 'all' || r.siteName === site) &&
        (late === 'all' || lateBucket(r.daysLate) === late) &&
        (!term || normalize(`${r.tenantName} ${r.unitCode} ${r.tenantPhone ?? ''}`).includes(term)),
    );
  }, [all, q, site, late]);

  const total = filtered.reduce((s, r) => s + r.remaining, 0);
  const debtors = new Set(filtered.map((r) => r.tenantId)).size;
  const avgLate = filtered.length
    ? Math.round(filtered.reduce((s, r) => s + r.daysLate, 0) / filtered.length)
    : 0;

  const lateCounts = useMemo(() => {
    const base = all.filter((r) => site === 'all' || r.siteName === site);
    const c = { all: base.length, l30: 0, l60: 0, l60plus: 0 };
    for (const r of base) c[lateBucket(r.daysLate)] += 1;
    return c;
  }, [all, site]);

  const columns: Column<ArrearRow>[] = [
    {
      key: 'tenant',
      header: t('table.tenant'),
      sortValue: (r) => r.tenantName,
      cell: (r) => (
        <span className="min-w-0">
          <span className="block truncate font-semibold text-slate-900">{r.tenantName}</span>
          <span className="block truncate text-xs text-slate-500">{r.tenantPhone ?? '—'}</span>
        </span>
      ),
    },
    {
      key: 'unit',
      header: t('table.unit'),
      sortValue: (r) => r.unitCode,
      cell: (r) => (
        <span>
          <span className="font-semibold text-slate-800">{r.unitCode}</span>
          <span className="block text-xs text-slate-500">{r.siteName}</span>
        </span>
      ),
    },
    {
      key: 'type',
      header: t('table.type'),
      sortValue: (r) => r.type,
      cell: (r) => <span className="text-slate-700">{t(`lists.chargeType.${r.type}`, r.type)}</span>,
    },
    {
      key: 'due',
      header: t('table.dueDate'),
      sortValue: (r) => r.dueDate,
      cell: (r) => <span className="tabular-nums text-slate-700">{formatDate(r.dueDate)}</span>,
    },
    {
      key: 'late',
      header: t('table.late'),
      align: 'right',
      sortValue: (r) => r.daysLate,
      cell: (r) => <LateBadge days={r.daysLate} label={t('lists.days', { n: r.daysLate })} />,
    },
    {
      key: 'remaining',
      header: t('table.remaining'),
      align: 'right',
      sortValue: (r) => r.remaining,
      cell: (r) => <Money value={r.remaining} tone="negative" />,
    },
  ];

  const mobileCard = (r: ArrearRow) => (
    <Link to={`/tenants/${r.tenantId}`} className="flex items-center justify-between gap-3 p-4 transition hover:bg-slate-50">
      <span className="min-w-0">
        <span className="block truncate font-semibold text-slate-900">{r.tenantName}</span>
        <span className="block truncate text-xs text-slate-500">
          {r.unitCode} · {r.siteName} · {t(`lists.chargeType.${r.type}`, r.type)}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <Money value={r.remaining} tone="negative" />
        <LateBadge days={r.daysLate} label={t('lists.days', { n: r.daysLate })} />
      </span>
    </Link>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('arrears.title')}
        subtitle={t('pageSub.arrears')}
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => window.print()}>
              <PrinterIcon className="h-4 w-4" />
              {t('print.button')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void downloadExport('/exports/arrears?format=csv', 'impayes.csv')}
            >
              {t('arrears.export')}
            </Button>
          </>
        }
      />
      {(site !== 'all' || late !== 'all' || q.trim()) && (
        <PrintNote>
          {t('print.filters', {
            filters: [
              site !== 'all' ? site : null,
              late !== 'all'
                ? t(`lists.${late === 'l30' ? 'late30' : late === 'l60' ? 'late60' : 'late60plus'}`)
                : null,
              q.trim() ? `« ${q.trim()} »` : null,
            ]
              .filter(Boolean)
              .join(' · '),
          })}
        </PrintNote>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile label={t('table.total')} value={`${formatAmount(total)} FCFA`} icon={BanknoteIcon} tone="red" />
        <StatTile label={t('lists.debtors')} value={String(debtors)} icon={UsersIcon} tone="slate" />
        <StatTile label={t('lists.avgLate')} value={t('lists.days', { n: avgLate })} icon={ClockAlertIcon} tone="amber" />
      </div>

      <div className="space-y-3">
        <TableToolbar count={t('table.results', { count: filtered.length })}>
          <SearchField value={q} onChange={setQ} placeholder={t('tenants.search')} />
          {sites.length > 1 && (
            <FilterChips
              options={[
                { key: 'all', label: t('lists.allSites') },
                ...sites.map((s) => ({ key: s, label: s })),
              ]}
              value={site}
              onChange={setSite}
              ariaLabel={t('table.site')}
            />
          )}
        </TableToolbar>
        <FilterChips<LateKey>
          options={[
            { key: 'all', label: t('lists.lateAll'), count: lateCounts.all },
            { key: 'l30', label: t('lists.late30'), count: lateCounts.l30, dot: 'bg-amber-500' },
            { key: 'l60', label: t('lists.late60'), count: lateCounts.l60, dot: 'bg-red-400' },
            { key: 'l60plus', label: t('lists.late60plus'), count: lateCounts.l60plus, dot: 'bg-red-600' },
          ]}
          value={late}
          onChange={setLate}
          ariaLabel={t('table.late')}
        />
      </div>

      {rows === null ? (
        <PageSkeleton variant="rows" />
      ) : filtered.length === 0 ? (
        all.length === 0 ? (
          <EmptyState
            icon={CheckCircleIcon}
            title={t('empty.noArrearsTitle')}
            message={t('empty.noArrearsMsg')}
          />
        ) : (
          <EmptyState
            icon={CheckCircleIcon}
            title={t('empty.noMatchTitle')}
            message={t('empty.noMatchMsg')}
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setQ('');
                  setSite('all');
                  setLate('all');
                }}
              >
                {t('empty.resetFilters')}
              </Button>
            }
          />
        )
      ) : (
        <DataTable
          caption={t('arrears.title')}
          columns={columns}
          rows={filtered}
          rowKey={(r) => r.chargeId}
          rowHref={(r) => `/tenants/${r.tenantId}`}
          defaultSort={{ key: 'late', dir: 'desc' }}
          mobileCard={mobileCard}
          footer={
            <tr>
              <td colSpan={5} className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">
                {t('table.total')}
              </td>
              <td className="px-4 py-3 text-right">
                <Money value={total} tone="negative" />
              </td>
            </tr>
          }
        />
      )}
    </div>
  );
}
