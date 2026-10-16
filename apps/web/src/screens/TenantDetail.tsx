import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TenantDeletionCheck } from '@bailo/shared';
import { api, API, ApiError } from '../lib/api';
import { formatDate, formatFcfa } from '../lib/format';
import { signedUrl } from '../lib/upload';
import { SignedImage } from '../components/SignedImage';
import { Card, Badge, Button, StatTile, ProgressBar, type Tone, PageSkeleton } from '../components/ui';
import { useConfirm } from '../components/Confirm';
import { useToast } from '../components/Toast';
import {
  ArchiveIcon,
  BanknoteIcon,
  CheckCircleIcon,
  ClockAlertIcon,
  RotateCcwIcon,
  TrashIcon,
  WalletIcon,
} from '../components/icons';

interface Guarantor {
  id: string;
  name: string;
  phone: string | null;
  relationship: string | null;
  isPrimaryPayer: boolean;
}
interface TimelinePayment {
  paymentId: string; receiptNumber: string; mode: string;
  paidAt: string; allocated: number;
}
interface TimelineCharge {
  id: string; type: string; amount: number; paid: number; remaining: number;
  dueDate: string; status: string; periodLabel: string | null;
  payments: TimelinePayment[];
}
interface TimelineOccupancy {
  occupancyId: string;
  status: 'ACTIVE' | 'NOTICE' | 'CLOSED';
  unitCode: string; siteName: string;
  startDate: string; actualEndDate: string | null;
  totalCharged: number; totalPaid: number; totalRemaining: number;
  depositExpected: number; depositPaid: number;
  charges: TimelineCharge[];
  payments: { id: string; receiptNumber: string; mode: string; paidAt: string; amount: number; reference: string | null }[];
}
interface Tenant {
  id: string; name: string; phone: string | null; whatsapp: string | null;
  occupation: string | null; photoKey: string | null; idDocKey: string | null;
  idDocType: string | null; idDocNumber: string | null;
  emergencyName: string | null; emergencyPhone: string | null;
  notes: string | null;
  archived: boolean;
  guarantors: Guarantor[];
}
interface Payload {
  tenant: Tenant;
  timeline: TimelineOccupancy[];
}

const MODE_LABELS: Record<string, string> = {
  ESPECES: 'Espèces', MTN_MOMO: 'MTN MoMo', ORANGE_MONEY: 'Orange Money',
  VIREMENT: 'Virement', AUTRE: 'Autre',
};

export function TenantDetail() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const toast = useToast();
  const [data, setData] = useState<Payload | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api
      .get<Payload>(`/tenants/${id}`)
      .then(setData)
      .catch(() => setData(null));
  }, [id]);
  useEffect(load, [load]);

  if (!data) return <PageSkeleton />;
  const { tenant, timeline } = data;

  const errorText = (err: unknown) =>
    err instanceof ApiError && err.code
      ? t(`errors.${err.code}`, { defaultValue: err.message })
      : (err as Error).message || t('confirm.genericError');

  /**
   * Suppression guidée : on demande d'abord à l'API ce qui est possible
   * (définitif / archivage / bloqué) pour afficher la bonne fenêtre, puis on
   * laisse le serveur rejouer le contrôle dans la transaction.
   */
  const onDelete = async () => {
    setBusy(true);
    let check: TenantDeletionCheck;
    try {
      check = await api.get<TenantDeletionCheck>(`/tenants/${tenant.id}/deletion-check`);
    } catch (err) {
      toast.error(errorText(err));
      setBusy(false);
      return;
    }
    setBusy(false);
    const name = tenant.name;
    const c = check.counts;

    if (check.mode === 'blocked') {
      const current = timeline.find((o) => o.status !== 'CLOSED');
      const go = await confirm({
        title: t('tenant.blockedTitle', { name }),
        message: t('tenant.blockedMsg'),
        confirmLabel: current ? t('tenant.blockedOk') : t('common.close'),
        cancelLabel: t('common.close'),
      });
      if (go && current) navigate(`/checkout?occupancyId=${current.occupancyId}`);
      return;
    }

    if (check.mode === 'archive') {
      const ok = await confirm({
        title: t('tenant.archiveTitle', { name }),
        message: (
          <>
            <p>{t('tenant.archiveMsg', { count: c.payments })}</p>
            <p className="mt-2">{t('tenant.archiveHint')}</p>
          </>
        ),
        confirmLabel: t('tenant.archiveOk'),
        cancelLabel: t('confirm.keep'),
      });
      if (!ok) return;
    } else {
      const parts = [
        c.occupancies > 0 && t('tenant.deleteCountOcc', { count: c.occupancies }),
        c.charges > 0 && t('tenant.deleteCountCharges', { count: c.charges }),
        c.guarantors > 0 && t('tenant.deleteCountGuarantors', { count: c.guarantors }),
      ].filter(Boolean) as string[];
      const ok = await confirm({
        title: t('tenant.deleteTitle', { name }),
        message: (
          <>
            <p>{t('tenant.deleteMsg')}</p>
            {parts.length > 0 && (
              <>
                <p className="mt-2">{t('tenant.deleteWill')}</p>
                <ul className="mt-1 list-disc pl-5">
                  {parts.map((p) => <li key={p}>{p}</li>)}
                </ul>
              </>
            )}
            {c.activeOccupancies > 0 && <p className="mt-2">{t('tenant.deleteUnitFreed')}</p>}
            <p className="mt-2 font-medium text-slate-700">{t('tenant.deleteIrreversible')}</p>
          </>
        ),
        confirmLabel: t('tenant.deleteOk'),
        cancelLabel: t('confirm.keep'),
        tone: 'danger',
        requireText: t('confirm.deleteWord'),
      });
      if (!ok) return;
    }

    setBusy(true);
    try {
      const res = await api.delete<{ mode: 'deleted' | 'archived' }>(`/tenants/${tenant.id}`);
      if (res.mode === 'deleted') {
        toast.success(t('tenant.deleted', { name }));
        navigate('/tenants', { replace: true });
      } else {
        toast.success(t('tenant.archived', { name }));
        load();
      }
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const onRestore = async () => {
    setBusy(true);
    try {
      await api.post(`/tenants/${tenant.id}/restore`, {});
      toast.success(t('tenant.restored', { name: tenant.name }));
      load();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const statusLabel = (s: TimelineOccupancy['status']) =>
    s === 'ACTIVE' ? t('tenant.active') : s === 'NOTICE' ? t('tenant.notice') : t('tenant.closed');
  const statusTone = (s: TimelineOccupancy['status']): Tone =>
    s === 'ACTIVE' ? 'emerald' : s === 'NOTICE' ? 'amber' : 'slate';

  const openIdDoc = async () => {
    if (!tenant.idDocKey) return;
    try { window.open(await signedUrl(tenant.idDocKey), '_blank', 'noopener'); } catch { /* lien expiré : rien à faire */ }
  };
  const openContract = async (occupancyId: string) => {
    const res = await fetch(`${API}/occupancies/${occupancyId}/contract`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('at') ?? ''}` },
    });
    if (!res.ok) return;
    window.open(URL.createObjectURL(await res.blob()), '_blank', 'noopener');
  };
  const openReceipt = async (paymentId: string) => {
    const res = await fetch(`${API}/payments/${paymentId}/receipt`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('at') ?? ''}` },
    });
    if (!res.ok) return;
    window.open(URL.createObjectURL(await res.blob()), '_blank', 'noopener');
  };

  // Agrégats globaux (toutes occupations)
  const totalPaid = timeline.reduce((s, o) => s + o.totalPaid, 0);
  const totalRemaining = timeline.reduce((s, o) => s + o.totalRemaining, 0);
  const depositExpected = timeline.reduce((s, o) => s + o.depositExpected, 0);
  const depositPaid = timeline.reduce((s, o) => s + o.depositPaid, 0);
  const depositPct = depositExpected > 0 ? Math.round((depositPaid / depositExpected) * 100) : 0;

  return (
    <div className="space-y-4">
      {tenant.archived && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-inset ring-amber-200 print:hidden"
        >
          <ArchiveIcon className="h-5 w-5 shrink-0 text-amber-600" />
          <span className="min-w-0 flex-1">{t('tenant.archivedBanner')}</span>
          <Button variant="secondary" size="sm" busy={busy} onClick={() => void onRestore()}>
            <RotateCcwIcon className="h-4 w-4" />
            {t('tenant.restore')}
          </Button>
        </div>
      )}

      {/* Bandeau identité */}
      <Card className="flex flex-wrap items-start gap-3">
        {tenant.photoKey ? (
          <SignedImage
            objectKey={tenant.photoKey}
            alt={tenant.name}
            className="h-16 w-16 flex-none rounded-full object-cover ring-1 ring-slate-200"
          />
        ) : (
          <span className="flex h-16 w-16 flex-none items-center justify-center rounded-full bg-brand/10 text-xl font-bold text-brand">
            {tenant.name.charAt(0).toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-bold text-slate-900">
            {tenant.name}
            {tenant.archived && <Badge tone="amber">{t('tenant.archivedBadge')}</Badge>}
          </h1>
          <p className="text-sm text-slate-500">
            {tenant.phone ?? '—'}
            {tenant.whatsapp && tenant.whatsapp !== tenant.phone ? ` · WhatsApp ${tenant.whatsapp}` : ''}
            {tenant.occupation ? ` · ${tenant.occupation}` : ''}
          </p>
          {(tenant.idDocType || tenant.idDocNumber || tenant.idDocKey) && (
            <p className="mt-1 text-sm text-slate-500">
              {tenant.idDocType ?? t('tenant.idDoc')}
              {tenant.idDocNumber ? ` · ${tenant.idDocNumber}` : ''}
              {tenant.idDocKey && (
                <button onClick={openIdDoc} className="ml-2 font-medium text-brand underline">
                  {t('tenant.viewIdDoc')}
                </button>
              )}
            </p>
          )}
          {tenant.emergencyName && (
            <p className="mt-1 text-xs text-slate-400">
              Urgence : {tenant.emergencyName}
              {tenant.emergencyPhone ? ` · ${tenant.emergencyPhone}` : ''}
            </p>
          )}
          {tenant.notes && (
            <p className="mt-1 text-xs italic text-slate-500">« {tenant.notes} »</p>
          )}
        </div>
        {!tenant.archived && (
          <div className="ml-auto shrink-0 print:hidden">
            {/* Libellé neutre : la fenêtre précise ensuite s'il s'agit d'une
                suppression définitive, d'un archivage ou d'un blocage. */}
            <button
              type="button"
              onClick={() => void onDelete()}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-red-700 ring-1 ring-inset ring-red-200 transition hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <TrashIcon className="h-4 w-4" />
              {t('tenant.delete')}
            </button>
          </div>
        )}
      </Card>

      {/* KPIs financiers globaux */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Total payé" value={formatFcfa(totalPaid)} icon={CheckCircleIcon} tone="emerald" />
        <StatTile
          label="Reste à payer"
          value={formatFcfa(totalRemaining)}
          icon={ClockAlertIcon}
          tone={totalRemaining > 0 ? 'red' : 'emerald'}
        />
        <StatTile
          label="Caution"
          value={`${formatFcfa(depositPaid)} / ${formatFcfa(depositExpected)}`}
          icon={WalletIcon}
          tone={depositPaid >= depositExpected ? 'emerald' : 'amber'}
        />
        <StatTile
          label="Occupations"
          value={String(timeline.length)}
          icon={BanknoteIcon}
          tone="slate"
        />
      </div>

      {depositExpected > 0 && (
        <Card>
          <div className="mb-2 flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Caution versée</span>
            <span className="font-bold text-slate-900">{depositPct}%</span>
          </div>
          <ProgressBar value={depositPct} tone={depositPct === 100 ? 'emerald' : 'amber'} />
        </Card>
      )}

      {/* Garants */}
      {tenant.guarantors.length > 0 && (
        <section>
          <h2 className="mb-2 font-semibold text-slate-900">{t('tenant.guarantors')}</h2>
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-100">
            {tenant.guarantors.map((g) => (
              <li key={g.id} className="flex items-center gap-2 p-3.5 text-sm">
                <span className="min-w-0">
                  <span className="font-medium text-slate-800">{g.name}</span>
                  <span className="text-slate-400">
                    {g.relationship ? ` (${g.relationship})` : ''}
                    {g.phone ? ` · ${g.phone}` : ''}
                  </span>
                </span>
                {g.isPrimaryPayer && (
                  <span className="ml-auto shrink-0">
                    <Badge tone="emerald">{t('tenant.primaryPayer')}</Badge>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Timeline par occupation : charges + paiements */}
      {timeline.map((o) => (
        <section key={o.occupancyId}>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-slate-900">
              {o.unitCode} <span className="text-sm font-normal text-slate-400">· {o.siteName}</span>
            </h2>
            <div className="flex items-center gap-2 text-xs">
              <Badge tone={statusTone(o.status)}>{statusLabel(o.status)}</Badge>
              <span className="text-slate-400">
                {formatDate(o.startDate)}
                {o.actualEndDate ? ` → ${formatDate(o.actualEndDate)}` : ''}
              </span>
            </div>
          </div>

          {/* Barre d'actions */}
          <div className="mb-2 flex flex-wrap gap-2 text-xs">
            <button onClick={() => void openContract(o.occupancyId)} className="rounded-md bg-slate-100 px-2 py-1 font-medium text-slate-700 hover:bg-slate-200">
              {t('tenant.contract')}
            </button>
            {o.status !== 'CLOSED' && (
              <>
                <Link to={`/collect?occupancyId=${o.occupancyId}&room=${o.unitCode}`} className="rounded-md bg-emerald-100 px-2 py-1 font-medium text-emerald-700 hover:bg-emerald-200">
                  {t('nav.collect')}
                </Link>
                <Link to={`/checkout?occupancyId=${o.occupancyId}`} className="rounded-md bg-red-100 px-2 py-1 font-medium text-red-700 hover:bg-red-200">
                  {t('tenant.checkout')}
                </Link>
              </>
            )}
          </div>

          {/* Mini-récap occupation */}
          <Card className="mb-2 grid grid-cols-3 gap-2 text-center text-xs">
            <div>
              <div className="text-slate-400">Facturé</div>
              <div className="font-semibold text-slate-900">{formatFcfa(o.totalCharged)}</div>
            </div>
            <div>
              <div className="text-slate-400">Payé</div>
              <div className="font-semibold text-emerald-700">{formatFcfa(o.totalPaid)}</div>
            </div>
            <div>
              <div className="text-slate-400">Reste</div>
              <div className={`font-semibold ${o.totalRemaining > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                {formatFcfa(o.totalRemaining)}
              </div>
            </div>
          </Card>

          {/* Timeline des charges */}
          <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-100">
            <div className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Échéances
            </div>
            <ul className="divide-y divide-slate-100">
              {o.charges.map((c) => {
                const dueColor =
                  c.status === 'PAID' ? 'text-emerald-700' :
                  c.status === 'OVERDUE' ? 'text-red-700' :
                  c.status === 'PARTIAL' ? 'text-amber-700' :
                  'text-slate-700';
                const paidByAdvance = c.payments.some((p) => new Date(p.paidAt) < new Date(c.dueDate));
                return (
                  <li key={c.id} className="px-3 py-2.5 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`font-medium ${dueColor}`}>
                            {c.type} {c.periodLabel ? `· ${c.periodLabel}` : ''}
                          </span>
                          {paidByAdvance && c.remaining === 0 && (
                            <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">
                              ⇇ avance
                            </span>
                          )}
                          {c.status === 'OVERDUE' && (
                            <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                              retard
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-400">
                          dû le {formatDate(c.dueDate)}
                        </div>
                        {c.payments.length > 0 && (
                          <ul className="mt-1 space-y-0.5 text-xs text-slate-500">
                            {c.payments.map((p) => (
                              <li key={p.paymentId + c.id}>
                                → {formatDate(p.paidAt)} ·{' '}
                                <button
                                  onClick={() => void openReceipt(p.paymentId)}
                                  className="font-medium text-brand hover:underline"
                                >
                                  reçu N° {p.receiptNumber}
                                </button>{' '}
                                · {MODE_LABELS[p.mode] ?? p.mode} ·{' '}
                                <span className="font-medium text-slate-700">{formatFcfa(p.allocated)}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div className="shrink-0 text-right text-sm">
                        <div className="font-semibold text-slate-900">{formatFcfa(c.amount)}</div>
                        {c.remaining > 0 && (
                          <div className="text-xs font-medium text-red-600">
                            reste {formatFcfa(c.remaining)}
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      ))}
    </div>
  );
}
