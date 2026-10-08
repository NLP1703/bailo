import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';

interface ReminderItem {
  id: string;
  stage: string;
  message: string;
  tenantName: string;
  unitCode: string;
}
interface TodayResponse {
  total: number;
  byStage: Record<string, ReminderItem[]>;
}

export function Reminders() {
  const { t } = useTranslation();
  const [data, setData] = useState<TodayResponse | null>(null);

  const load = () => {
    api
      .get<TodayResponse>('/reminders/today')
      .then(setData)
      .catch(() => setData({ total: 0, byStage: {} }));
  };
  useEffect(load, []);

  const openWa = async (id: string) => {
    const { links } = await api.get<{ links: { url: string }[] }>(`/reminders/${id}/wa-link`);
    if (links[0]) window.open(links[0].url, '_blank');
  };
  const markSent = async (id: string) => {
    await api.post(`/reminders/${id}/sent`, {});
    load();
  };

  if (!data) return <p className="text-slate-500">{t('common.loading')}</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">
        {t('reminders.title')} · {data.total}
      </h1>
      {data.total === 0 && <p className="text-slate-500">{t('reminders.none')}</p>}
      {Object.entries(data.byStage).map(([stage, items]) => (
        <div key={stage}>
          <h2 className="mb-1 text-sm font-semibold text-slate-600">{stage}</h2>
          <ul className="space-y-2">
            {items.map((r) => (
              <li key={r.id} className="rounded-lg bg-white p-3 shadow-sm">
                <div className="text-sm font-medium">
                  {r.tenantName} · {r.unitCode}
                </div>
                <p className="mt-1 text-xs text-slate-500">{r.message}</p>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => void openWa(r.id)}
                    className="rounded bg-emerald-600 px-3 py-1 text-xs text-white"
                  >
                    {t('reminders.send')}
                  </button>
                  <button
                    onClick={() => void markSent(r.id)}
                    className="rounded bg-slate-200 px-3 py-1 text-xs"
                  >
                    {t('reminders.markSent')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
