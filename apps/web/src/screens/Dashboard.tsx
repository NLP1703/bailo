import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { formatDate } from '../lib/format';
import { PageHeader, StatTile, Card, EmptyState, Badge } from '../components/ui';
import { DataTable, Money, formatAmount, type Column } from '../components/data';
import { BarChart } from '../components/BarChart';
import {
  BanknoteIcon,
  WalletIcon,
  CheckCircleIcon,
  DoorIcon,
  ChevronRightIcon,
} from '../components/icons';

/** « 2026-10 » → « Octobre 2026 » (ou « October 2026 »). */
function monthLabel(month: string, lang: string, style: 'long' | 'short' = 'long'): string {
  const d = new Date(`${month}-01T00:00:00`);
  if (Number.isNaN(d.getTime())) return month;
  const label = d.toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-FR', {
    month: style,
    ...(style === 'long' ? { year: 'numeric' } : {}),
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

interface TenantPayment {
  occupancyId: string;
  tenantName: string;
  unitCode: string;
  siteName: string;
  totalPaid: number;
  nextDueDate: string | null;
  nextDueAmount: number | null;
}

interface Dashboard {
  month: string;
  expected: number; // reste à encaisser (avances + paiements du mois déjà déduits)
  expectedGross: number; // brut théorique du mois
  coveredByAdvance: number; // part couverte par des avances antérieures (info)
  collected: number;
  remaining: number;
  recoveryRate: number;
  occupancyRate: number;
  unitCount: number;
  activeOccupancies: number;
  byMode: { mode: string; amount: number }[];
  byCollector: { collectorId: string; name: string; amount: number }[];
  perSite: {
    siteId: string;
    name: string;
    recettes: number;
    units: number;
    occupied: number;
    occupancyRate: number;
  }[];
  topArrears: {
    chargeId: string;
    tenantId: string;
    tenantName: string;
    unitCode: string;
    remaining: number;
    daysLate: number;
  }[];
  tenantPayments: TenantPayment[];
  history: { month: string; collected: number }[];
  previousCollected: number;
}

const MODE_LABELS: Record<string, string> = {
  ESPECES: 'Espèces',
  MTN_MOMO: 'MTN MoMo',
  ORANGE_MONEY: 'Orange Money',
  VIREMENT: 'Virement',
  AUTRE: 'Autre',
};

export function Dashboard() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState(false);
  const [chartAsTable, setChartAsTable] = useState(false);

  useEffect(() => {
    api
      .get<Dashboard>('/dashboard')
      .then(setData)
      .catch(() => setError(true));
  }, []);

  if (error) return <EmptyState message={t('dashboard.loadError')} />;
  if (!data) return <DashboardSkeleton />;

  const history = data.history ?? [];
  const prevMonth = history.length >= 2 ? history[history.length - 2]!.month : null;
  const delta =
    data.previousCollected > 0 && prevMonth
      ? {
          pct: Math.round(((data.collected - data.previousCollected) / data.previousCollected) * 100),
          label: t('dashboard.vsPrev', { month: monthLabel(prevMonth, lang, 'short').toLowerCase() }),
        }
      : null;

  const tenantColumns: Column<TenantPayment>[] = [
    {
      key: 'tenant',
      header: t('table.tenant'),
      sortValue: (r) => r.tenantName,
      cell: (r) => <span className="font-semibold text-slate-900">{r.tenantName}</span>,
    },
    {
      key: 'unit',
      header: t('table.unit'),
      sortValue: (r) => r.unitCode,
      cell: (r) => (
        <span>
          <span className="font-semibold text-slate-800">{r.unitCode}</span>
          <span className="ml-1.5 text-xs text-slate-500">{r.siteName}</span>
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
      key: 'next',
      header: t('table.nextDue'),
      align: 'right',
      sortValue: (r) => r.nextDueDate,
      cell: (r) =>
        r.nextDueDate ? (
          <span className="tabular-nums">
            <span className="block text-slate-800">{formatDate(r.nextDueDate)}</span>
            {r.nextDueAmount !== null && (
              <span className="block text-xs text-slate-500">{formatAmount(r.nextDueAmount)} FCFA</span>
            )}
          </span>
        ) : (
          <span className="text-xs font-medium text-emerald-700">{t('dashboard.noNextDue')}</span>
        ),
    },
  ];

  const chartData = history.map((h) => ({
    key: h.month,
    label: monthLabel(h.month, lang, 'short'),
    title: monthLabel(h.month, lang),
    value: h.collected,
  }));
  const chartEmpty = history.every((h) => h.collected === 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('dashboard.title')}
        subtitle={t('pageSub.dashboard')}
        actions={<Badge tone="brand">{monthLabel(data.month, lang)}</Badge>}
      />

      {/* Indicateurs clés */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label={t('dashboard.collected')}
          value={`${formatAmount(data.collected)} FCFA`}
          icon={CheckCircleIcon}
          tone="emerald"
          delta={delta}
          hint={delta ? undefined : t('dashboard.thisMonth')}
        />
        <StatTile
          label={t('dashboard.expectedGross')}
          value={`${formatAmount(data.expectedGross)} FCFA`}
          icon={BanknoteIcon}
          tone="slate"
          hint={
            data.coveredByAdvance > 0
              ? t('dashboard.coveredHint', { amount: formatAmount(data.coveredByAdvance) })
              : t('dashboard.remainingHint', { amount: formatAmount(data.expected) })
          }
        />
        <StatTile
          label={t('dashboard.recovery')}
          value={`${data.recoveryRate} %`}
          icon={WalletIcon}
          tone="brand"
          meter={data.recoveryRate}
          hint={t('dashboard.remainingHint', { amount: formatAmount(data.expected) })}
        />
        <StatTile
          label={t('dashboard.occupancy')}
          value={`${data.occupancyRate} %`}
          icon={DoorIcon}
          tone="brand"
          meter={data.occupancyRate}
          hint={t('dashboard.unitsHint', { occupied: data.activeOccupancies, units: data.unitCount })}
        />
      </div>

      {/* Graphique 6 mois + occupation par cité */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="font-semibold text-slate-900">{t('dashboard.chartTitle')}</h2>
              <p className="text-xs text-slate-500">{t('dashboard.chartSub')}</p>
            </div>
            <div className="inline-flex shrink-0 self-start rounded-lg bg-slate-100 p-0.5 text-xs font-semibold">
              {([false, true] as const).map((asTable) => (
                <button
                  key={String(asTable)}
                  onClick={() => setChartAsTable(asTable)}
                  aria-pressed={chartAsTable === asTable}
                  className={`rounded-md px-2.5 py-1 transition ${
                    chartAsTable === asTable ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {asTable ? t('dashboard.showTable') : t('dashboard.showChart')}
                </button>
              ))}
            </div>
          </div>
          {chartAsTable ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">
                  <th className="py-2 text-left">{t('dashboard.monthCol')}</th>
                  <th className="py-2 text-right">{t('dashboard.collected')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[...chartData].reverse().map((d) => (
                  <tr key={d.key}>
                    <td className="py-2 text-slate-700">{d.title}</td>
                    <td className="py-2 text-right">
                      <Money value={d.value} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : chartEmpty ? (
            <div className="flex h-[220px] items-center justify-center rounded-lg bg-slate-50 text-sm text-slate-500">
              {t('dashboard.noData')}
            </div>
          ) : (
            <BarChart data={chartData} ariaLabel={t('dashboard.chartTitle')} />
          )}
        </Card>

        <Card>
          <h2 className="mb-1 font-semibold text-slate-900">{t('dashboard.occupancyBySite')}</h2>
          <p className="mb-4 text-xs text-slate-500">{t('dashboard.occupancyBySiteSub')}</p>
          {data.perSite.length === 0 ? (
            <p className="text-sm text-slate-500">—</p>
          ) : (
            <ul className="space-y-4">
              {data.perSite.map((s) => (
                <li key={s.siteId}>
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="truncate font-medium text-slate-800">{s.name}</span>
                    <span className="shrink-0 font-semibold tabular-nums text-slate-900">{s.occupancyRate} %</span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-brand" style={{ width: `${s.occupancyRate}%` }} />
                  </div>
                  <div className="mt-1.5 flex justify-between gap-2 text-xs text-slate-500">
                    <span className="tabular-nums">
                      {t('dashboard.unitsHint', { occupied: s.occupied, units: s.units })}
                    </span>
                    <span>
                      {t('dashboard.income')} <Money value={s.recettes} className="text-xs" />
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Locataires & paiements + top impayés */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className="space-y-2 lg:col-span-2">
          <h2 className="font-semibold text-slate-900">{t('dashboard.tenantPayments')}</h2>
          <DataTable
            caption={t('dashboard.tenantPayments')}
            columns={tenantColumns}
            rows={data.tenantPayments}
            rowKey={(r) => r.occupancyId}
            pageSize={8}
            empty={<EmptyState icon={CheckCircleIcon} message={t('dashboard.noActiveTenants')} />}
          />
        </section>

        <section className="space-y-2">
          <div className="flex items-baseline justify-between">
            <h2 className="font-semibold text-slate-900">{t('dashboard.topArrears')}</h2>
            <Link to="/arrears" className="text-xs font-semibold text-brand hover:text-brand-dark">
              {t('dashboard.seeAll')}
            </Link>
          </div>
          {data.topArrears.length === 0 ? (
            <EmptyState icon={CheckCircleIcon} message={t('reminders.none')} />
          ) : (
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl bg-white shadow-card ring-1 ring-slate-200/70">
              {data.topArrears.map((a) => (
                <li key={a.chargeId}>
                  <Link
                    to={`/tenants/${a.tenantId}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 text-sm transition hover:bg-slate-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-slate-900">{a.tenantName}</span>
                      <span className="text-xs text-slate-500">
                        {a.unitCode} · {t('lists.days', { n: a.daysLate })}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <Money value={a.remaining} tone="negative" />
                      <ChevronRightIcon className="h-4 w-4 text-slate-300" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Répartition des encaissements */}
      {data.byMode.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ShareList
            title={t('dashboard.byMode')}
            total={data.collected}
            rows={data.byMode.map((m) => ({ key: m.mode, label: MODE_LABELS[m.mode] ?? m.mode, amount: m.amount }))}
          />
          <ShareList
            title={t('dashboard.byCollector')}
            total={data.collected}
            rows={data.byCollector.map((c) => ({ key: c.collectorId, label: c.name, amount: c.amount }))}
          />
        </div>
      )}
    </div>
  );
}

/** Répartition d'un total : libellé, montant et part en %, trié du plus gros au plus petit. */
function ShareList({
  title,
  total,
  rows,
}: {
  title: string;
  total: number;
  rows: { key: string; label: string; amount: number }[];
}) {
  const sorted = [...rows].sort((a, b) => b.amount - a.amount);
  return (
    <Card>
      <h2 className="mb-4 font-semibold text-slate-900">{title}</h2>
      <ul className="space-y-3">
        {sorted.map((r) => {
          const pct = total > 0 ? Math.round((r.amount / total) * 100) : 0;
          return (
            <li key={r.key}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate text-slate-700">{r.label}</span>
                <span className="flex shrink-0 items-baseline gap-2">
                  <Money value={r.amount} />
                  <span className="w-10 text-right text-xs tabular-nums text-slate-500">{pct} %</span>
                </span>
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-[#4f9d95]" style={{ width: `${pct}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** Squelette de chargement à la forme du tableau de bord. */
function DashboardSkeleton() {
  const block = 'animate-pulse rounded-xl bg-slate-200/60';
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="space-y-2">
        <div className={`${block} h-7 w-56`} />
        <div className={`${block} h-4 w-96 max-w-full`} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`${block} h-[118px]`} />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className={`${block} h-[290px] lg:col-span-2`} />
        <div className={`${block} h-[290px]`} />
      </div>
    </div>
  );
}
