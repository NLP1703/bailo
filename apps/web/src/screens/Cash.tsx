import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatDate } from '../lib/format';
import { PageHeader, Card, StatTile, NativeSelect, Input, Button, EmptyState } from '../components/ui';
import { BanknoteIcon, WalletIcon, CheckCircleIcon, PrinterIcon } from '../components/icons';
import { DataTable, Money, formatAmount } from '../components/data';

interface Journal {
  collectorId: string | null;
  expectedTotal: number;
  handedTotal: number;
  toHand: number;
  payments: {
    id: string;
    amount: number;
    paidAt: string;
    receiptNumber: string;
    unitCode: string;
    tenantName: string;
  }[];
}
type CashPayment = Journal['payments'][number];
interface User {
  id: string;
  name: string;
  role: string;
}

function firstOfMonth(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

export function Cash() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isOwner = user?.role === 'OWNER';
  const canHandover = user?.role === 'OWNER' || user?.role === 'MANAGER';

  const [collectorId, setCollectorId] = useState(user?.id ?? '');
  const [users, setUsers] = useState<User[]>([]);
  const [journal, setJournal] = useState<Journal | null>(null);
  const [handed, setHanded] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isOwner)
      api
        .get<User[]>('/users')
        .then(setUsers)
        .catch(() => setUsers([]));
  }, [isOwner]);

  const load = () => {
    const q = collectorId ? `?collectorId=${collectorId}` : '';
    api
      .get<Journal>(`/cash${q}`)
      .then(setJournal)
      .catch(() => setJournal(null));
  };
  useEffect(load, [collectorId]);

  const submitHandover = async () => {
    if (!collectorId || !Number(handed)) return;
    setBusy(true);
    try {
      await api.post('/cash/handovers', {
        collectorId,
        periodStart: firstOfMonth(),
        periodEnd: new Date().toISOString().slice(0, 10),
        handedAmount: Number(handed),
        note: note || undefined,
      });
      setHanded('');
      setNote('');
      load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('cash.title')}
        subtitle={t('pageSub.cash')}
        actions={
          journal && journal.payments.length > 0 ? (
            <Button variant="secondary" size="sm" onClick={() => window.print()}>
              <PrinterIcon className="h-4 w-4" />
              {t('print.button')}
            </Button>
          ) : undefined
        }
      />

      {isOwner && users.length > 0 && (
        <label className="block max-w-sm print:hidden">
          <span className="mb-1 block text-xs font-medium text-slate-500">{t('cash.collector')}</span>
          <NativeSelect value={collectorId} onChange={(e) => setCollectorId(e.target.value)}>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} · {t(`profile.role.${u.role}`)}
              </option>
            ))}
          </NativeSelect>
        </label>
      )}

      {journal && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatTile
              label={t('cash.expected')}
              value={`${formatAmount(journal.expectedTotal)} FCFA`}
              icon={BanknoteIcon}
              tone="slate"
            />
            <StatTile
              label={t('cash.handed')}
              value={`${formatAmount(journal.handedTotal)} FCFA`}
              icon={CheckCircleIcon}
              tone="emerald"
            />
            <StatTile
              label={t('cash.toHand')}
              value={`${formatAmount(journal.toHand)} FCFA`}
              icon={WalletIcon}
              tone={journal.toHand > 0 ? 'amber' : 'emerald'}
            />
          </div>

          {canHandover && (
            <Card className="space-y-3 print:hidden">
              <div className="flex items-center gap-2 font-semibold text-slate-900">
                <WalletIcon className="h-5 w-5 text-brand" />
                {t('cash.handover')}
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]">
                <Input
                  inputMode="numeric"
                  placeholder={t('cash.handedAmount')}
                  value={handed}
                  onChange={(e) => setHanded(e.target.value.replace(/\D/g, ''))}
                />
                <Input
                  placeholder={t('cash.note')}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
                <Button busy={busy} onClick={submitHandover} className="md:px-6">
                  {t('cash.submit')}
                </Button>
              </div>
            </Card>
          )}

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-900">{t('lists.cashPayments')}</h2>
            {journal.payments.length === 0 ? (
              <EmptyState icon={BanknoteIcon} message={t('cash.expected')} />
            ) : (
              <DataTable<CashPayment>
                caption={t('lists.cashPayments')}
                rows={journal.payments}
                rowKey={(p) => p.id}
                defaultSort={{ key: 'date', dir: 'desc' }}
                columns={[
                  {
                    key: 'date',
                    header: t('table.date'),
                    sortValue: (p) => p.paidAt,
                    cell: (p) => <span className="tabular-nums text-slate-700">{formatDate(p.paidAt)}</span>,
                  },
                  {
                    key: 'receipt',
                    header: t('table.receipt'),
                    sortValue: (p) => p.receiptNumber,
                    cell: (p) => (
                      <span className="font-mono text-xs font-medium text-slate-700">{p.receiptNumber}</span>
                    ),
                  },
                  {
                    key: 'tenant',
                    header: t('table.tenant'),
                    sortValue: (p) => p.tenantName,
                    cell: (p) => <span className="font-medium text-slate-900">{p.tenantName}</span>,
                  },
                  {
                    key: 'unit',
                    header: t('table.unit'),
                    sortValue: (p) => p.unitCode,
                    cell: (p) => <span className="font-semibold text-slate-700">{p.unitCode}</span>,
                  },
                  {
                    key: 'amount',
                    header: t('table.amount'),
                    align: 'right',
                    sortValue: (p) => p.amount,
                    cell: (p) => <Money value={p.amount} />,
                  },
                ]}
                mobileCard={(p) => (
                  <div className="flex items-center justify-between gap-3 p-4 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-slate-900">
                        {p.tenantName} · {p.unitCode}
                      </span>
                      <span className="block text-xs text-slate-500 tabular-nums">
                        {formatDate(p.paidAt)} · {p.receiptNumber}
                      </span>
                    </span>
                    <Money value={p.amount} />
                  </div>
                )}
                footer={
                  <tr>
                    <td colSpan={4} className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">
                      {t('table.total')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Money value={journal.expectedTotal} />
                    </td>
                  </tr>
                }
              />
            )}
          </section>
        </>
      )}
    </div>
  );
}
