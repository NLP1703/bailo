import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { formatDate, formatFcfa } from '../lib/format';
import { FileField } from '../components/FileField';

interface Site {
  id: string;
  name: string;
}
interface Expense {
  id: string;
  category: string;
  amount: number;
  spentAt: string;
  description: string | null;
}

const CATEGORIES = ['EAU', 'ELECTRICITE', 'ENTRETIEN', 'REPARATION', 'SALAIRE', 'TAXE', 'AUTRE'];

export function Expenses() {
  const { t } = useTranslation();
  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState('');
  const [rows, setRows] = useState<Expense[]>([]);
  const [category, setCategory] = useState('ENTRETIEN');
  const [amount, setAmount] = useState('');
  const [spentAt, setSpentAt] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState('');
  const [attachmentKey, setAttachmentKey] = useState<string | null>(null);

  const load = () => {
    api
      .get<Expense[]>('/expenses')
      .then(setRows)
      .catch(() => setRows([]));
  };
  useEffect(() => {
    api.get<Site[]>('/sites').then((s) => {
      setSites(s);
      if (s[0]) setSiteId(s[0].id);
    });
    load();
  }, []);

  const add = async () => {
    if (!siteId || !Number(amount)) return;
    await api.post('/expenses', {
      siteId,
      category,
      amount: Number(amount),
      spentAt,
      description: description || undefined,
      ...(attachmentKey ? { attachmentKey } : {}),
    });
    setAmount('');
    setDescription('');
    setAttachmentKey(null);
    load();
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{t('expenses.title')}</h1>

      <div className="space-y-2 rounded-lg bg-white p-3 shadow-sm">
        <select
          className="w-full rounded border border-slate-300 px-3 py-2"
          value={siteId}
          onChange={(e) => setSiteId(e.target.value)}
        >
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <select
            className="rounded border border-slate-300 px-2 py-2"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input
            className="flex-1 rounded border border-slate-300 px-3 py-2"
            inputMode="numeric"
            placeholder={t('expenses.amount')}
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
          />
        </div>
        <input
          type="date"
          className="w-full rounded border border-slate-300 px-3 py-2"
          value={spentAt}
          onChange={(e) => setSpentAt(e.target.value)}
        />
        <input
          className="w-full rounded border border-slate-300 px-3 py-2"
          placeholder={t('expenses.description')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <FileField
          purpose="expense-attachment"
          label={t('expenses.attachment')}
          accept="image/*,application/pdf"
          onUploaded={setAttachmentKey}
        />
        <button onClick={add} className="w-full rounded bg-brand py-2 font-semibold text-white">
          {t('expenses.add')}
        </button>
      </div>

      <ul className="divide-y divide-slate-100 rounded-lg bg-white shadow-sm">
        {rows.map((e) => (
          <li key={e.id} className="flex items-center justify-between p-3 text-sm">
            <span>
              {formatDate(e.spentAt)} · {e.category}
              {e.description ? ` · ${e.description}` : ''}
            </span>
            <span className="font-semibold">{formatFcfa(e.amount)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
