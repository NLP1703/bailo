// Dépenses du bailleur : saisie par catégorie, filtre par période/site, + onglet « Résultat net par cité ».
import { useCallback, useEffect, useMemo, useState } from 'react';
import { EXPENSE_CATEGORIES, type ExpenseCategory } from '@bailo/shared';
import { api, ApiError } from '../lib/api';
import { formatDate, formatFcfa } from '../lib/format';
import { Badge, Button, Card, PageHeader, PageSkeleton, StatTile, type Tone } from '../components/ui';
import { useToast } from '../components/Toast';
import { PlusIcon, ReceiptIcon } from '../components/icons';

interface Site { id: string; name: string }
interface Expense {
  id: string; category: ExpenseCategory; label: string;
  amount: number; spentAt: string;
  payee: string | null; note: string | null;
  siteId: string | null;
  ticketId: string | null;
}
interface NetRow { siteId: string; name: string; income: number; expense: number; net: number }

const CAT_LABEL: Record<ExpenseCategory, string> = {
  MAINTENANCE: 'Travaux', UTILITIES: 'Services (eau/élec)', TAX: 'Taxes', SALARY: 'Salaires',
  INSURANCE: 'Assurance', SUPPLIES: 'Fournitures', MARKETING: 'Marketing', OTHER: 'Divers',
};
const CAT_TONE: Record<ExpenseCategory, Tone> = {
  MAINTENANCE: 'amber', UTILITIES: 'brand', TAX: 'red', SALARY: 'slate',
  INSURANCE: 'emerald', SUPPLIES: 'slate', MARKETING: 'brand', OTHER: 'slate',
};

const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); };

export function Expenses() {
  const toast = useToast();
  const [tab, setTab] = useState<'list' | 'net'>('list');
  const [sites, setSites] = useState<Site[]>([]);
  const [list, setList] = useState<Expense[] | null>(null);
  const [net, setNet] = useState<NetRow[] | null>(null);
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [siteFilter, setSiteFilter] = useState<string>('');
  const [catFilter, setCatFilter] = useState<ExpenseCategory | ''>('');
  const [showNew, setShowNew] = useState(false);
  const [draft, setDraft] = useState({ siteId: '', category: 'MAINTENANCE' as ExpenseCategory, label: '', amount: '', spentAt: today(), payee: '', note: '' });
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    const qs = new URLSearchParams();
    if (siteFilter) qs.set('siteId', siteFilter);
    if (catFilter) qs.set('category', catFilter);
    qs.set('from', from); qs.set('to', to);
    api.get<Expense[]>(`/expenses?${qs}`).then(setList).catch(() => setList([]));
  }, [siteFilter, catFilter, from, to]);
  useEffect(reload, [reload]);
  useEffect(() => {
    api.get<Site[]>('/sites').then(setSites).catch(() => setSites([]));
  }, []);

  const loadNet = useCallback(() => {
    api.get<NetRow[]>(`/expenses/net-result?from=${from}&to=${to}`).then(setNet).catch(() => setNet([]));
  }, [from, to]);
  useEffect(() => { if (tab === 'net') loadNet(); }, [tab, loadNet]);

  const total = useMemo(() => (list ?? []).reduce((s, e) => s + e.amount, 0), [list]);
  const siteName = (id: string | null) => id ? (sites.find((s) => s.id === id)?.name ?? '—') : 'Portefeuille';

  if (!list) return <PageSkeleton />;

  const save = async () => {
    const amount = Number(draft.amount);
    if (!draft.label || !amount) { toast.error('Libellé et montant requis'); return; }
    setBusy(true);
    try {
      await api.post('/expenses', {
        siteId: draft.siteId || undefined,
        category: draft.category,
        label: draft.label,
        amount,
        spentAt: draft.spentAt,
        payee: draft.payee || undefined,
        note: draft.note || undefined,
        recurring: false,
      });
      toast.success('Dépense enregistrée');
      setShowNew(false);
      setDraft({ siteId: '', category: 'MAINTENANCE', label: '', amount: '', spentAt: today(), payee: '', note: '' });
      reload();
      if (tab === 'net') loadNet();
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erreur'); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Dépenses"
        subtitle="Travaux, taxes, salaires, assurance — pour calculer le résultat net de chaque cité."
        actions={<Button onClick={() => setShowNew(true)}><PlusIcon className="mr-1 h-4 w-4" /> Nouvelle dépense</Button>}
      />

      <div className="flex gap-2 print:hidden">
        <button onClick={() => setTab('list')} className={`rounded-lg px-4 py-2 text-sm font-medium ${tab === 'list' ? 'bg-brand text-white' : 'bg-white text-slate-700 ring-1 ring-slate-300'}`}>Dépenses</button>
        <button onClick={() => setTab('net')} className={`rounded-lg px-4 py-2 text-sm font-medium ${tab === 'net' ? 'bg-brand text-white' : 'bg-white text-slate-700 ring-1 ring-slate-300'}`}>Résultat net par cité</button>
      </div>

      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm"><span className="block text-xs text-slate-500">Du</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              className="mt-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
          </label>
          <label className="text-sm"><span className="block text-xs text-slate-500">Au</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
              className="mt-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
          </label>
          {tab === 'list' && (
            <>
              <label className="text-sm"><span className="block text-xs text-slate-500">Cité</span>
                <select value={siteFilter} onChange={(e) => setSiteFilter(e.target.value)}
                  className="mt-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm">
                  <option value="">Toutes</option>
                  {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
              <label className="text-sm"><span className="block text-xs text-slate-500">Catégorie</span>
                <select value={catFilter} onChange={(e) => setCatFilter(e.target.value as ExpenseCategory | '')}
                  className="mt-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm">
                  <option value="">Toutes</option>
                  {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{CAT_LABEL[c]}</option>)}
                </select>
              </label>
            </>
          )}
        </div>
      </Card>

      {tab === 'list' ? (
        <>
          <StatTile label="Total dépenses sur la période" value={formatFcfa(total)} icon={ReceiptIcon} tone="amber" />
          <Card>
            {list.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">Aucune dépense sur cette période.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {list.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center gap-2 py-2">
                    <span className="w-24 font-mono text-xs text-slate-500">{formatDate(e.spentAt)}</span>
                    <Badge tone={CAT_TONE[e.category]}>{CAT_LABEL[e.category]}</Badge>
                    <span className="font-medium text-slate-900">{e.label}</span>
                    <span className="text-xs text-slate-500">· {siteName(e.siteId)}</span>
                    {e.payee && <span className="text-xs text-slate-500">· {e.payee}</span>}
                    {e.ticketId && <Badge tone="brand">Ticket</Badge>}
                    <span className="ml-auto text-sm font-semibold text-slate-900">{formatFcfa(e.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      ) : (
        <Card>
          <h2 className="mb-3 text-sm font-semibold">Résultat net sur la période</h2>
          {!net ? (
            <p className="text-sm text-slate-500">Calcul…</p>
          ) : net.length === 0 ? (
            <p className="text-sm text-slate-500">Aucun site.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-slate-500">
                <tr><th className="py-2 text-left">Cité</th><th className="py-2 text-right">Recettes</th><th className="py-2 text-right">Dépenses</th><th className="py-2 text-right">Net</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {net.map((r) => (
                  <tr key={r.siteId}>
                    <td className="py-2 font-medium">{r.name}</td>
                    <td className="py-2 text-right text-emerald-700">{formatFcfa(r.income)}</td>
                    <td className="py-2 text-right text-amber-700">-{formatFcfa(r.expense)}</td>
                    <td className={`py-2 text-right font-semibold ${r.net >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{formatFcfa(r.net)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-slate-200 bg-slate-50">
                  <td className="py-2 font-semibold">Total portefeuille</td>
                  <td className="py-2 text-right font-semibold text-emerald-700">{formatFcfa(net.reduce((s, r) => s + r.income, 0))}</td>
                  <td className="py-2 text-right font-semibold text-amber-700">-{formatFcfa(net.reduce((s, r) => s + r.expense, 0))}</td>
                  <td className="py-2 text-right font-semibold">{formatFcfa(net.reduce((s, r) => s + r.net, 0))}</td>
                </tr>
              </tbody>
            </table>
          )}
        </Card>
      )}

      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog">
          <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-base font-semibold">Nouvelle dépense</h3>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-sm sm:col-span-2">
                <span className="text-slate-600">Libellé</span>
                <input value={draft.label} onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
                  placeholder="Ex. Réparation plomberie bloc A"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
              </label>
              <label className="text-sm">
                <span className="text-slate-600">Catégorie</span>
                <select value={draft.category} onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value as ExpenseCategory }))}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">
                  {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{CAT_LABEL[c]}</option>)}
                </select>
              </label>
              <label className="text-sm">
                <span className="text-slate-600">Montant (FCFA)</span>
                <input type="number" min={1} value={draft.amount} onChange={(e) => setDraft((d) => ({ ...d, amount: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
              </label>
              <label className="text-sm">
                <span className="text-slate-600">Date</span>
                <input type="date" value={draft.spentAt} onChange={(e) => setDraft((d) => ({ ...d, spentAt: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
              </label>
              <label className="text-sm">
                <span className="text-slate-600">Cité (facultatif)</span>
                <select value={draft.siteId} onChange={(e) => setDraft((d) => ({ ...d, siteId: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">
                  <option value="">Commun au portefeuille</option>
                  {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
              <label className="text-sm sm:col-span-2">
                <span className="text-slate-600">Bénéficiaire (facultatif)</span>
                <input value={draft.payee} onChange={(e) => setDraft((d) => ({ ...d, payee: e.target.value }))}
                  placeholder="Nom du prestataire ou fournisseur"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
              </label>
              <label className="text-sm sm:col-span-2">
                <span className="text-slate-600">Note (facultatif)</span>
                <textarea rows={2} value={draft.note} onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowNew(false)}>Annuler</Button>
              <Button onClick={save} disabled={busy}>Enregistrer</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
