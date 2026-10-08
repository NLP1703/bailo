import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatDate, formatFcfa } from '../lib/format';

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
  }[];
}
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
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{t('cash.title')}</h1>

      {isOwner && users.length > 0 && (
        <select
          className="w-full rounded border border-slate-300 px-3 py-2"
          value={collectorId}
          onChange={(e) => setCollectorId(e.target.value)}
        >
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} ({u.role})
            </option>
          ))}
        </select>
      )}

      {journal && (
        <>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-white p-3 shadow-sm">
              <div className="text-xs text-slate-500">{t('cash.expected')}</div>
              <div className="font-semibold">{formatFcfa(journal.expectedTotal)}</div>
            </div>
            <div className="rounded-lg bg-white p-3 shadow-sm">
              <div className="text-xs text-slate-500">{t('cash.handed')}</div>
              <div className="font-semibold">{formatFcfa(journal.handedTotal)}</div>
            </div>
            <div className="rounded-lg bg-white p-3 shadow-sm">
              <div className="text-xs text-slate-500">{t('cash.toHand')}</div>
              <div className="font-semibold">{formatFcfa(journal.toHand)}</div>
            </div>
          </div>

          {canHandover && (
            <div className="space-y-2 rounded-lg bg-white p-3 shadow-sm">
              <div className="font-semibold">{t('cash.handover')}</div>
              <input
                className="w-full rounded border border-slate-300 px-3 py-2"
                inputMode="numeric"
                placeholder={t('cash.handedAmount')}
                value={handed}
                onChange={(e) => setHanded(e.target.value.replace(/\D/g, ''))}
              />
              <input
                className="w-full rounded border border-slate-300 px-3 py-2"
                placeholder={t('cash.note')}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <button
                onClick={submitHandover}
                className="w-full rounded bg-brand py-2 font-semibold text-white"
              >
                {t('cash.submit')}
              </button>
            </div>
          )}

          <ul className="divide-y divide-slate-100 rounded-lg bg-white shadow-sm">
            {journal.payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between p-3 text-sm">
                <span>
                  {formatDate(p.paidAt)} · {p.unitCode} · {p.receiptNumber}
                </span>
                <span className="font-semibold">{formatFcfa(p.amount)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
