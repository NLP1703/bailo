import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { formatFcfa } from '../lib/format';

interface OccView {
  occupancy: { id: string; deposit: number; unit: { code: string }; tenant: { name: string } };
  summary: { balance: number };
}
interface Retenue {
  amount: number;
  reason: string;
}
interface CloseResult {
  closeSummary: { depositPaid: number; unpaidTotal: number; retenuesTotal: number; refund: number };
}

export function Checkout() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const occupancyId = params.get('occupancyId') ?? '';

  const [data, setData] = useState<OccView | null>(null);
  const [actualEndDate, setActualEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [retenues, setRetenues] = useState<Retenue[]>([]);
  const [result, setResult] = useState<CloseResult['closeSummary'] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (occupancyId)
      api
        .get<OccView>(`/occupancies/${occupancyId}`)
        .then(setData)
        .catch(() => setData(null));
  }, [occupancyId]);

  const addRetenue = () => setRetenues((r) => [...r, { amount: 0, reason: '' }]);
  const updateRetenue = (i: number, patch: Partial<Retenue>) =>
    setRetenues((r) => r.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));

  const submit = async () => {
    setBusy(true);
    try {
      const res = await api.post<CloseResult>(`/occupancies/${occupancyId}/close`, {
        actualEndDate,
        retenues: retenues.filter((r) => r.amount > 0 && r.reason.trim()),
      });
      setResult(res.closeSummary);
    } finally {
      setBusy(false);
    }
  };

  if (!occupancyId) return <p className="text-slate-500">—</p>;
  if (!data) return <p className="text-slate-500">{t('common.loading')}</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">
        {t('checkout.title')} · {data.occupancy.tenant.name} · {data.occupancy.unit.code}
      </h1>

      {result ? (
        <div className="space-y-1 rounded-lg bg-white p-4 shadow-sm">
          <Row label={t('checkout.deposit')} value={result.depositPaid} />
          <Row label={t('checkout.unpaid')} value={-result.unpaidTotal} />
          <Row label={t('checkout.retenues')} value={-result.retenuesTotal} />
          <hr className="my-2" />
          <div className="flex justify-between font-bold">
            <span>{result.refund >= 0 ? t('checkout.refund') : t('checkout.owed')}</span>
            <span>{formatFcfa(Math.abs(result.refund))}</span>
          </div>
          <p className="pt-2 text-sm text-emerald-700">{t('checkout.success')}</p>
        </div>
      ) : (
        <>
          <label className="block text-sm">
            {t('checkout.actualEndDate')}
            <input
              type="date"
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              value={actualEndDate}
              onChange={(e) => setActualEndDate(e.target.value)}
            />
          </label>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold">{t('checkout.retenues')}</span>
              <button onClick={addRetenue} className="rounded bg-slate-200 px-2 py-1 text-xs">
                + {t('checkout.addRetenue')}
              </button>
            </div>
            {retenues.map((r, i) => (
              <div key={i} className="flex gap-2">
                <input
                  className="w-28 rounded border border-slate-300 px-2 py-2"
                  inputMode="numeric"
                  placeholder={t('checkout.retenues')}
                  value={r.amount || ''}
                  onChange={(e) =>
                    updateRetenue(i, { amount: Number(e.target.value.replace(/\D/g, '')) || 0 })
                  }
                />
                <input
                  className="flex-1 rounded border border-slate-300 px-2 py-2"
                  placeholder={t('checkout.reason')}
                  value={r.reason}
                  onChange={(e) => updateRetenue(i, { reason: e.target.value })}
                />
              </div>
            ))}
          </div>

          <button
            disabled={busy}
            onClick={submit}
            className="w-full rounded bg-red-600 py-3 font-semibold text-white disabled:opacity-50"
          >
            {t('checkout.submit')}
          </button>
        </>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-slate-600">{label}</span>
      <span>{formatFcfa(value)}</span>
    </div>
  );
}
