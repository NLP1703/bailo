import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { PageHeader, Card, Button, Badge, EmptyState, PageSkeleton } from '../components/ui';
import { BellIcon, CheckIcon } from '../components/icons';

interface ReminderItem {
  id: string;
  stage: string;
  message: string;
  tenantName: string;
  unitCode: string;
}
interface ReservationAlert {
  unitId: string;
  unitCode: string;
  siteName: string;
  reservedFor: string | null;
  reservedUntil: string;
  daysUntil: number;
  kind: 'ARRIVAL_SOON' | 'EXPIRED';
  label: string;
}
interface TodayResponse {
  total: number;
  byStage: Record<string, ReminderItem[]>;
  reservationAlerts: ReservationAlert[];
}

export function Reminders() {
  const { t } = useTranslation();
  const [data, setData] = useState<TodayResponse | null>(null);

  const load = () => {
    api
      .get<TodayResponse>('/reminders/today')
      .then(setData)
      .catch(() => setData({ total: 0, byStage: {}, reservationAlerts: [] }));
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

  if (!data) return <PageSkeleton variant="list" />;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('reminders.title')}
        subtitle={t('pageSub.reminders')}
        action={<Badge tone={data.total > 0 ? 'amber' : 'emerald'}>{data.total}</Badge>}
      />

      {/* Alertes de réservation — affichées en tête, séparées des relances financières */}
      {data.reservationAlerts.length > 0 && (
        <section>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-600">
            <span className="inline-block h-2 w-2 rounded-full bg-sky-500" />
            Alertes de réservation
          </h2>
          <ul className="space-y-2">
            {data.reservationAlerts.map((a) => {
              const expired = a.kind === 'EXPIRED';
              const tone = expired
                ? 'bg-red-50 ring-red-200'
                : a.daysUntil === 0
                  ? 'bg-emerald-50 ring-emerald-200'
                  : 'bg-sky-50 ring-sky-200';
              const textTone = expired
                ? 'text-red-800'
                : a.daysUntil === 0
                  ? 'text-emerald-800'
                  : 'text-sky-800';
              return (
                <li
                  key={a.unitId}
                  className={`flex items-center gap-3 rounded-xl p-3 ring-1 ring-inset ${tone}`}
                >
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/60 text-xs font-bold ${textTone}`}>
                    {a.unitCode}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className={`text-sm font-semibold ${textTone}`}>
                      {a.reservedFor ?? '(sans nom)'}
                    </div>
                    <div className={`text-xs ${textTone} opacity-80`}>
                      {a.siteName} · {a.label}
                    </div>
                  </div>
                  {expired ? (
                    <Link
                      to="/tenants"
                      className="shrink-0 rounded-md bg-red-100 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-200"
                    >
                      Résoudre
                    </Link>
                  ) : (
                    <Link
                      to={`/new-entry?unitId=${a.unitId}`}
                      className="shrink-0 rounded-md bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-200"
                    >
                      Confirmer l'arrivée
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {data.total === 0 && <EmptyState icon={BellIcon} message={t('reminders.none')} />}
      {Object.entries(data.byStage).map(([stage, items]) => (
        <div key={stage} className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-600">
            {t(`templates.stage.${stage}`, { defaultValue: stage })}
          </h2>
          {items.map((r) => (
            <Card key={r.id}>
              <div className="text-sm font-semibold text-slate-800">
                {r.tenantName} <span className="font-normal text-slate-400">· {r.unitCode}</span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">{r.message}</p>
              <div className="mt-3 flex gap-2">
                <Button variant="success" size="sm" onClick={() => void openWa(r.id)}>
                  {t('reminders.send')}
                </Button>
                <Button variant="secondary" size="sm" onClick={() => void markSent(r.id)}>
                  <CheckIcon className="h-4 w-4" />
                  {t('reminders.markSent')}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      ))}
    </div>
  );
}
