import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { formatFcfa } from '../lib/format';
import { PageHeader, Card, Input, Label, Button, PageSkeleton } from '../components/ui';
import { PlusIcon, CheckCircleIcon } from '../components/icons';

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
  if (!data) return <PageSkeleton />;

  return (
    <div className="space-y-4">
      <PageHeader title={t('checkout.title')} />
      <p className="-mt-2 text-sm text-slate-500">
        {data.occupancy.tenant.name} · {data.occupancy.unit.code}
      </p>

      {result ? (
        <Card className="space-y-1">
          <Row label={t('checkout.deposit')} value={result.depositPaid} />
          <Row label={t('checkout.unpaid')} value={-result.unpaidTotal} />
          <Row label={t('checkout.retenues')} value={-result.retenuesTotal} />
          <hr className="my-2 border-slate-100" />
          <div className="flex justify-between text-base font-bold text-slate-900">
            <span>{result.refund >= 0 ? t('checkout.refund') : t('checkout.owed')}</span>
            <span className={result.refund >= 0 ? 'text-emerald-600' : 'text-red-600'}>
              {formatFcfa(Math.abs(result.refund))}
            </span>
          </div>
          <p className="flex items-center gap-2 pt-2 text-sm font-medium text-emerald-700">
            <CheckCircleIcon className="h-5 w-5" />
            {t('checkout.success')}
          </p>
        </Card>
      ) : (
        <>
          <Card className="space-y-3">
            <div>
              <Label>{t('checkout.actualEndDate')}</Label>
              <Input
                type="date"
                value={actualEndDate}
                onChange={(e) => setActualEndDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>{t('checkout.retenues')}</Label>
                <Button variant="secondary" size="sm" onClick={addRetenue}>
                  <PlusIcon className="h-4 w-4" />
                  {t('checkout.addRetenue')}
                </Button>
              </div>
              {retenues.map((r, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    className="w-28"
                    inputMode="numeric"
                    placeholder="0"
                    value={r.amount || ''}
                    onChange={(e) =>
                      updateRetenue(i, { amount: Number(e.target.value.replace(/\D/g, '')) || 0 })
                    }
                  />
                  <Input
                    placeholder={t('checkout.reason')}
                    value={r.reason}
                    onChange={(e) => updateRetenue(i, { reason: e.target.value })}
                  />
                </div>
              ))}
            </div>
          </Card>

          <Button variant="danger" block busy={busy} onClick={submit}>
            {t('checkout.submit')}
          </Button>
        </>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-slate-600">{label}</span>
      <span className="font-medium text-slate-900">{formatFcfa(value)}</span>
    </div>
  );
}
