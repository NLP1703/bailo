import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { formatFcfa } from '../lib/format';

interface Dashboard {
  month: string;
  expected: number;
  collected: number;
  remaining: number;
  recoveryRate: number;
  occupancyRate: number;
  topArrears: {
    chargeId: string;
    tenantName: string;
    unitCode: string;
    remaining: number;
    daysLate: number;
  }[];
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white p-3 shadow-sm">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}

export function Dashboard() {
  const { t } = useTranslation();
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api
      .get<Dashboard>('/dashboard')
      .then(setData)
      .catch(() => setError(true));
  }, []);

  if (error) return <p className="text-slate-500">{t('common.loading')}…</p>;
  if (!data) return <p className="text-slate-500">{t('common.loading')}</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">
        {t('dashboard.title')} · {data.month}
      </h1>
      <div className="grid grid-cols-2 gap-3">
        <Tile label={t('dashboard.expected')} value={formatFcfa(data.expected)} />
        <Tile label={t('dashboard.collected')} value={formatFcfa(data.collected)} />
        <Tile label={t('dashboard.remaining')} value={formatFcfa(data.remaining)} />
        <Tile label={t('dashboard.recovery')} value={`${data.recoveryRate}%`} />
      </div>
      <div className="rounded-lg bg-white p-3 shadow-sm">
        <div className="text-xs text-slate-500">{t('dashboard.occupancy')}</div>
        <div className="mt-1 h-2 w-full overflow-hidden rounded bg-slate-200">
          <div className="h-full bg-brand" style={{ width: `${data.occupancyRate}%` }} />
        </div>
        <div className="mt-1 text-right text-xs">{data.occupancyRate}%</div>
      </div>
      <div>
        <h2 className="mb-2 font-semibold">{t('dashboard.topArrears')}</h2>
        <ul className="divide-y divide-slate-100 rounded-lg bg-white shadow-sm">
          {data.topArrears.map((a) => (
            <li key={a.chargeId} className="flex items-center justify-between p-3 text-sm">
              <span>
                {a.tenantName} · {a.unitCode}
              </span>
              <span className="text-right">
                <span className="font-semibold">{formatFcfa(a.remaining)}</span>
                <span className="ml-2 text-xs text-red-600">
                  {t('arrears.daysLate', { days: a.daysLate })}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
