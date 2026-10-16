import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { CreatePaymentDto, PaymentMode } from '@bailo/shared';
import { api, ApiError, API } from '../lib/api';
import { enqueuePayment } from '../lib/sync';
import { formatFcfa } from '../lib/format';
import { FileField } from '../components/FileField';
import { PageHeader, Card, Input, Label, NativeSelect, Button } from '../components/ui';
import { DoorIcon, ChevronRightIcon, CheckCircleIcon } from '../components/icons';

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
  const [lastPaymentId, setLastPaymentId] = useState<string | null>(null);
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
    setLastPaymentId(null);
    const body: CreatePaymentDto = {
      occupancyId,
      clientId: crypto.randomUUID(),
      amount: amountNum,
      mode,
      ...(proofKey ? { proofKey } : {}),
    };
    try {
      if (!navigator.onLine) throw new ApiError(0, 'offline');
      const res = await api.post<{ payment: { id: string; receiptNumber: string } }>(
        '/payments',
        body,
      );
      setMessage(t('collect.done', { number: res.payment.receiptNumber }));
      setLastPaymentId(res.payment.id);
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

  // Ouvre le reçu PDF (le GET exige le jeton : on récupère le blob puis on l'ouvre).
  const viewReceipt = async () => {
    if (!lastPaymentId) return;
    const res = await fetch(`${API}/payments/${lastPaymentId}/receipt`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('at') ?? ''}` },
    });
    const url = URL.createObjectURL(await res.blob());
    window.open(url, '_blank', 'noopener');
  };

  const sendReceipt = async () => {
    if (!lastPaymentId) return;
    const { links } = await api.get<{ links: { url: string }[] }>(
      `/payments/${lastPaymentId}/wa-link`,
    );
    if (links[0]) window.open(links[0].url, '_blank', 'noopener');
  };

  if (!occupancyId) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold text-slate-900">{t('collect.title')}</h1>
        <Link
          to="/rooms"
          className="flex items-center gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-100 transition hover:bg-slate-50"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand/10 text-brand">
            <DoorIcon className="h-5 w-5" />
          </span>
          <span className="font-medium text-slate-800">{t('rooms.title')}</span>
          <ChevronRightIcon className="ml-auto h-5 w-5 text-slate-300" />
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader subtitle={t('pageSub.collect')} title={room ? `${t('collect.title')} · ${room}` : t('collect.title')} />

      <Card className="space-y-3">
        <div>
          <Label>{t('collect.amount')}</Label>
          <Input
            inputMode="numeric"
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
            onBlur={doPreview}
          />
        </div>
        <div>
          <Label>{t('collect.mode')}</Label>
          <NativeSelect value={mode} onChange={(e) => setMode(e.target.value as PaymentMode)}>
            {MODES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </NativeSelect>
        </div>
        <FileField
          purpose="payment-proof"
          label={t('collect.proof')}
          accept="image/*,application/pdf"
          onUploaded={setProofKey}
        />
      </Card>

      {preview && (
        <Card className="text-sm">
          <div className="mb-2 font-semibold text-slate-900">{t('collect.preview')}</div>
          <div className="divide-y divide-slate-100">
            {preview.lines.map((l) => (
              <div key={l.chargeId} className="flex justify-between py-1.5">
                <span className="text-slate-600">
                  {l.type}
                  {l.periodMonth
                    ? ` ${String(l.periodMonth).padStart(2, '0')}/${l.periodYear}`
                    : ''}
                </span>
                <span className="font-medium text-slate-900">{formatFcfa(l.amount)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {message && (
        <p className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
          <CheckCircleIcon className="h-5 w-5 shrink-0" />
          {message}
        </p>
      )}

      {lastPaymentId && (
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={() => void viewReceipt()}>
            {t('collect.viewReceipt')}
          </Button>
          <Button variant="success" className="flex-1" onClick={() => void sendReceipt()}>
            {t('collect.sendReceipt')}
          </Button>
        </div>
      )}

      <Button block size="md" busy={busy} disabled={!amountNum} onClick={validate}>
        {t('collect.validate')}
      </Button>
    </div>
  );
}
