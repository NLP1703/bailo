import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { CreatePaymentDto, PaymentMode } from '@citegest/shared';
import { api, ApiError } from '../lib/api';
import { enqueuePayment } from '../lib/sync';
import { formatFcfa } from '../lib/format';
import { FileField } from '../components/FileField';

const MODES: PaymentMode[] = ['ESPECES', 'MTN_MOMO', 'ORANGE_MONEY', 'VIREMENT', 'AUTRE'];

interface PreviewLine {
  chargeId: string;
  amount: number;
  type?: string;
  periodMonth?: number;
  periodYear?: number;
}
interface Preview {
  amount: number;
  leftover: number;
  lines: PreviewLine[];
}

export function Collect() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const occupancyId = params.get('occupancyId') ?? '';
  const room = params.get('room') ?? '';

  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState<PaymentMode>('ESPECES');
  const [proofKey, setProofKey] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const amountNum = Number(amount);

  const doPreview = async () => {
    if (!occupancyId || !amountNum) return;
    try {
      setPreview(
        await api.get<Preview>(`/payments/preview?occupancyId=${occupancyId}&amount=${amountNum}`),
      );
    } catch {
      setPreview(null);
    }
  };

  const validate = async () => {
    if (!occupancyId || !amountNum) return;
    setBusy(true);
    setMessage('');
    const body: CreatePaymentDto = {
      occupancyId,
      clientId: crypto.randomUUID(),
      amount: amountNum,
      mode,
      ...(proofKey ? { proofKey } : {}),
    };
    try {
      if (!navigator.onLine) throw new ApiError(0, 'offline');
      const res = await api.post<{ payment: { receiptNumber: string } }>('/payments', body);
      setMessage(t('collect.done', { number: res.payment.receiptNumber }));
      setAmount('');
      setPreview(null);
      setProofKey(null);
    } catch {
      await enqueuePayment(body);
      setMessage(t('collect.queued'));
      setAmount('');
      setPreview(null);
      setProofKey(null);
    } finally {
      setBusy(false);
    }
  };

  if (!occupancyId) {
    return (
      <div className="text-slate-500">
        <h1 className="mb-2 text-xl font-bold">{t('collect.title')}</h1>
        <p>{t('rooms.title')} →</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">
        {t('collect.title')} {room && `· ${room}`}
      </h1>

      <label className="block text-sm">
        {t('collect.amount')}
        <input
          className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          inputMode="numeric"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
          onBlur={doPreview}
        />
      </label>

      <label className="block text-sm">
        {t('collect.mode')}
        <select
          className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          value={mode}
          onChange={(e) => setMode(e.target.value as PaymentMode)}
        >
          {MODES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </label>

      <FileField
        purpose="payment-proof"
        label={t('collect.proof')}
        accept="image/*,application/pdf"
        onUploaded={setProofKey}
      />

      {preview && (
        <div className="rounded-lg bg-white p-3 text-sm shadow-sm">
          <div className="mb-1 font-semibold">{t('collect.preview')}</div>
          {preview.lines.map((l) => (
            <div key={l.chargeId} className="flex justify-between">
              <span>
                {l.type}
                {l.periodMonth ? ` ${String(l.periodMonth).padStart(2, '0')}/${l.periodYear}` : ''}
              </span>
              <span>{formatFcfa(l.amount)}</span>
            </div>
          ))}
        </div>
      )}

      {message && <p className="rounded bg-emerald-50 p-2 text-sm text-emerald-700">{message}</p>}

      <button
        disabled={busy || !amountNum}
        onClick={validate}
        className="w-full rounded bg-brand py-3 font-semibold text-white disabled:opacity-60"
      >
        {t('collect.validate')}
      </button>
    </div>
  );
}
