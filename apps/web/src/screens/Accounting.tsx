import { useCallback, useEffect, useMemo, useState } from 'react';
import { authFetch, API, api, ApiError } from '../lib/api';
import { formatFcfa, formatDate } from '../lib/format';
import { Badge, Button, Card, PageHeader, PageSkeleton, StatTile } from '../components/ui';
import { useToast } from '../components/Toast';
import { DownloadIcon } from '../components/icons';

/**
 * Comptabilité OHADA — exporte vers le plan comptable SYSCOHADA (loyers 706,
 * mobile money 585, caisse 571, caution 4194, charges refacturées 708, etc.).
 * L'écran montre un aperçu équilibré débit/crédit et génère un CSV téléchargeable
 * directement ouvrable dans Excel (BOM UTF-8 + séparateur point-virgule).
 */
interface JournalRow {
  date: string;
  piece: string;
  compte: string;
  libelle: string;
  debit: number;
  credit: number;
}
interface AccountSummary {
  compte: string;
  libelle: string;
  debit: number;
  credit: number;
  solde: number;
}
interface JournalPreview {
  rows: JournalRow[];
  totals: { debit: number; credit: number; delta: number };
  byAccount: AccountSummary[];
}

const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
};

/** Télécharge un fichier produit par une URL authentifiée (Bearer). */
async function downloadWithAuth(url: string, suggestedName: string): Promise<void> {
  const res = await authFetch(url);
  if (!res.ok) throw new ApiError(res.status, `Téléchargement impossible (${res.status})`);
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = suggestedName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

export function Accounting() {
  const toast = useToast();
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [data, setData] = useState<JournalPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [tab, setTab] = useState<'ledger' | 'journal'>('ledger');

  const load = useCallback(() => {
    setLoading(true);
    const qs = new URLSearchParams({ from, to, format: 'CSV' });
    api
      .get<JournalPreview>(`/accounting/ohada-journal/preview?${qs}`)
      .then((d) => setData(d))
      .catch((err: ApiError) => {
        toast.error(err.message || 'Chargement impossible');
        setData({ rows: [], totals: { debit: 0, credit: 0, delta: 0 }, byAccount: [] });
      })
      .finally(() => setLoading(false));
  }, [from, to, toast]);
  useEffect(load, [load]);

  const onExport = useCallback(async () => {
    setExporting(true);
    try {
      const qs = new URLSearchParams({ from, to, format: 'CSV' });
      await downloadWithAuth(
        `${API}/accounting/ohada-journal?${qs}`,
        `bailo-ohada-${from}-${to}.csv`,
      );
      toast.success('Export CSV téléchargé');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setExporting(false);
    }
  }, [from, to, toast]);

  const balanced = useMemo(() => {
    if (!data) return false;
    return Math.abs(data.totals.delta) < 1;
  }, [data]);

  if (loading && !data) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Comptabilité OHADA"
        subtitle="Journal des écritures (débit/crédit) selon le plan SYSCOHADA — export CSV ouvrable dans Excel."
        actions={
          <Button variant="primary" onClick={onExport} disabled={exporting || !data?.rows.length}>
            <DownloadIcon className="h-4 w-4" />
            {exporting ? 'Export en cours…' : 'Télécharger CSV'}
          </Button>
        }
      />

      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-slate-500">Du</span>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-500">Au</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            />
          </label>
          <Button variant="secondary" onClick={load} disabled={loading}>
            Actualiser
          </Button>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Total débit" value={formatFcfa(data?.totals.debit ?? 0)} tone="emerald" />
        <StatTile label="Total crédit" value={formatFcfa(data?.totals.credit ?? 0)} tone="brand" />
        <StatTile
          label="Écart"
          value={formatFcfa(Math.abs(data?.totals.delta ?? 0))}
          tone={balanced ? 'emerald' : 'red'}
          hint={balanced ? 'Journal équilibré' : 'Non équilibré — vérifier les écritures'}
        />
      </div>

      <Card>
        <div className="mb-3 flex gap-2">
          <button
            type="button"
            onClick={() => setTab('ledger')}
            className={`rounded-full px-3 py-1 text-sm ${
              tab === 'ledger' ? 'bg-brand text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            Grand livre · {data?.byAccount.length ?? 0}
          </button>
          <button
            type="button"
            onClick={() => setTab('journal')}
            className={`rounded-full px-3 py-1 text-sm ${
              tab === 'journal' ? 'bg-brand text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            Journal · {data?.rows.length ?? 0}
          </button>
        </div>

        {tab === 'ledger' ? (
          data?.byAccount.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="py-2 pr-3">Compte</th>
                    <th className="py-2 pr-3">Libellé</th>
                    <th className="py-2 pr-3 text-right">Débit</th>
                    <th className="py-2 pr-3 text-right">Crédit</th>
                    <th className="py-2 pr-3 text-right">Solde</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byAccount.map((a) => (
                    <tr key={a.compte} className="border-b border-slate-100">
                      <td className="py-2 pr-3 font-mono text-slate-700">{a.compte}</td>
                      <td className="py-2 pr-3 text-slate-700">{a.libelle}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{formatFcfa(a.debit)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{formatFcfa(a.credit)}</td>
                      <td
                        className={`py-2 pr-3 text-right tabular-nums ${
                          a.solde >= 0 ? 'text-emerald-700' : 'text-red-700'
                        }`}
                      >
                        {formatFcfa(a.solde)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-slate-500">
              Aucune écriture sur cette période.
            </p>
          )
        ) : data?.rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Pièce</th>
                  <th className="py-2 pr-3">Compte</th>
                  <th className="py-2 pr-3">Libellé</th>
                  <th className="py-2 pr-3 text-right">Débit</th>
                  <th className="py-2 pr-3 text-right">Crédit</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r, i) => (
                  <tr key={`${r.piece}-${i}`} className="border-b border-slate-100">
                    <td className="py-2 pr-3 text-slate-600">{formatDate(r.date)}</td>
                    <td className="py-2 pr-3">
                      <Badge tone="slate">{r.piece}</Badge>
                    </td>
                    <td className="py-2 pr-3 font-mono text-slate-700">{r.compte}</td>
                    <td className="py-2 pr-3 text-slate-700">{r.libelle}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {r.debit ? formatFcfa(r.debit) : ''}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {r.credit ? formatFcfa(r.credit) : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-slate-500">
            Aucune écriture sur cette période.
          </p>
        )}
      </Card>

      <p className="text-xs text-slate-500">
        Plan comptable SYSCOHADA (sous-ensemble). Les loyers vont en 706, les
        cautions en 4194, l'eau/électricité refacturée en 708, la caisse en 571,
        le Mobile Money en 585. Export non audité — à faire valider par votre
        expert-comptable avant déclaration.
      </p>
    </div>
  );
}
