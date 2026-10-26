import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { CreatePaymentDto, PaymentMode } from '@bailo/shared';
import { api, ApiError, API, authFetch } from '../lib/api';
import { enqueuePayment } from '../lib/sync';
import { formatFcfa } from '../lib/format';
import { FileField } from '../components/FileField';
import { PageHeader, Card, Input, Label, Button } from '../components/ui';
import { DoorIcon, ChevronRightIcon, CheckCircleIcon } from '../components/icons';

// Libellés et pastilles courts des modes de paiement (chips lisibles au doigt).
const MODE_INFO: Record<PaymentMode, { label: string; short: string }> = {
  ESPECES: { label: 'Espèces', short: '💵' },
  MTN_MOMO: { label: 'MTN MoMo', short: 'MTN' },
  ORANGE_MONEY: { label: 'Orange Money', short: 'OM' },
  VIREMENT: { label: 'Virement', short: '🏦' },
  AUTRE: { label: 'Autre', short: '•' },
};
const MODES: PaymentMode[] = ['ESPECES', 'MTN_MOMO', 'ORANGE_MONEY', 'VIREMENT', 'AUTRE'];

// Suggestions de montants (le gardien saisit rarement un montant exotique).
const QUICK_AMOUNTS = [10_000, 25_000, 50_000, 100_000];

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
    const res = await authFetch(`${API}/payments/${lastPaymentId}/receipt`);
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
    // Marge basse mobile : bandeau Valider (≈ 72 px) + bottom-nav (72 px) + inset
    // → ≈ 160 px. Désactivé ≥ sm (le bouton redevient inline, pas de bandeau).
    <div className="space-y-4 pb-44 sm:pb-0">
      <PageHeader subtitle={t('pageSub.collect')} title={room ? `${t('collect.title')} · ${room}` : t('collect.title')} />

      <Card className="space-y-4">
        <div>
          <Label>{t('collect.amount')}</Label>
          {/* Grosse zone montant : chiffres plus lisibles (saisie éclair du gardien),
              clavier numérique sur mobile. */}
          <Input
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
            onBlur={doPreview}
            className="h-14 text-right text-2xl font-bold tabular-nums tracking-tight"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {QUICK_AMOUNTS.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => {
                  setAmount(String(v));
                  // Précharge l'aperçu dès qu'un montant est posé.
                  setTimeout(doPreview, 0);
                }}
                className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-200 active:scale-95"
              >
                + {formatFcfa(v)}
              </button>
            ))}
          </div>
        </div>

        <div>
          <Label>{t('collect.mode')}</Label>
          {/* Chips à sélection unique — plus rapide qu'un <select> natif au doigt,
              et plus clair que 5 radios empilés. */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {MODES.map((m) => {
              const active = m === mode;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-sm font-semibold transition ${
                    active
                      ? 'border-brand bg-brand text-white shadow-sm'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                  aria-pressed={active}
                >
                  <span className={active ? 'text-white' : 'text-slate-500'}>
                    {MODE_INFO[m].short}
                  </span>
                  <span className="truncate">{MODE_INFO[m].label}</span>
                </button>
              );
            })}
          </div>
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
                <span className="font-medium tabular-nums text-slate-900">{formatFcfa(l.amount)}</span>
              </div>
            ))}
          </div>
          {preview.leftover > 0 && (
            <p className="mt-2 rounded-lg bg-sky-50 px-2.5 py-1.5 text-xs font-medium text-sky-700 ring-1 ring-inset ring-sky-100">
              Avance : {formatFcfa(preview.leftover)} seront reportés sur les prochaines échéances.
            </p>
          )}
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

      {/* Validation : barre collée en bas sur mobile (toujours visible, au-dessus
          de la bottom-nav), bouton inline sur desktop.
          On la positionne à `bottom = hauteur bottom-nav + inset bas` pour que
          la bottom-nav reste visible dessous — on garde ainsi la navigation
          d'un seul tap depuis le formulaire d'encaissement. */}
      <div
        className="fixed inset-x-0 z-20 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none"
        style={{ bottom: 'calc(var(--bottom-nav-h) + var(--safe-bottom))' }}
      >
        <div className="mx-auto flex max-w-xl items-center gap-3">
          {amountNum > 0 && (
            <span className="hidden shrink-0 text-right text-xs text-slate-500 sm:block">
              Montant saisi
              <span className="block text-base font-bold tabular-nums text-slate-900">
                {formatFcfa(amountNum)}
              </span>
            </span>
          )}
          <Button
            block
            size="md"
            busy={busy}
            disabled={!amountNum}
            onClick={validate}
            className="h-12 text-base"
          >
            {amountNum > 0 ? `${t('collect.validate')} · ${formatFcfa(amountNum)}` : t('collect.validate')}
          </Button>
        </div>
      </div>
    </div>
  );
}
