import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, API } from '../lib/api';
import { formatFcfa } from '../lib/format';

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
  tenantName: string;
  unitCode: string;
  remaining: number;
  daysLate: number;
}

export function Arrears() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<ArrearRow[]>([]);

  useEffect(() => {
    api
      .get<ArrearRow[]>('/reports/arrears')
      .then(setRows)
      .catch(() => setRows([]));
  }, []);

  const total = rows.reduce((s, r) => s + r.remaining, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{t('arrears.title')}</h1>
        <button
          onClick={() => void downloadExport('/exports/arrears?format=csv', 'impayes.csv')}
          className="rounded bg-slate-200 px-3 py-1 text-xs"
        >
          {t('arrears.export')}
        </button>
      </div>
      <div className="text-sm text-slate-600">Total : {formatFcfa(total)}</div>
      <ul className="divide-y divide-slate-100 rounded-lg bg-white shadow-sm">
        {rows.map((r) => (
          <li key={r.chargeId} className="flex items-center justify-between p-3 text-sm">
            <span>
              {r.tenantName} · {r.unitCode}
            </span>
            <span className="text-right">
              <span className="font-semibold">{formatFcfa(r.remaining)}</span>
              <span className="ml-2 text-xs text-red-600">
                {t('arrears.daysLate', { days: r.daysLate })}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
