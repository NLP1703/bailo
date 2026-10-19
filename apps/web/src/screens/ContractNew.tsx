// Création d'un contrat (brouillon) à partir d'une occupation : pré-remplissage depuis l'API,
// édition du HTML, puis POST /contracts.
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { Button, Card, PageHeader, PageSkeleton } from '../components/ui';
import { useToast } from '../components/Toast';

interface Standard {
  bodyHtml: string;
  defaults: { monthlyRent: number; deposit: number; startDate: string };
}

export function ContractNew() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const occupancyId = params.get('occupancyId') ?? '';
  const [tpl, setTpl] = useState<Standard | null>(null);
  const [monthlyRent, setMonthlyRent] = useState(0);
  const [deposit, setDeposit] = useState(0);
  const [startDate, setStartDate] = useState('');
  const [durationMonths, setDuration] = useState<number | ''>('');
  const [noticeDays, setNotice] = useState(30);
  const [bodyHtml, setBodyHtml] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!occupancyId) return;
    api
      .get<Standard>(`/contracts/standard-body/${occupancyId}`)
      .then((s) => {
        setTpl(s);
        setMonthlyRent(s.defaults.monthlyRent);
        setDeposit(s.defaults.deposit);
        setStartDate(s.defaults.startDate);
        setBodyHtml(s.bodyHtml);
      })
      .catch((e) => toast.error(e instanceof ApiError ? e.message : 'Occupation introuvable'));
  }, [occupancyId, toast]);

  if (!occupancyId) {
    return (
      <Card>
        <p className="text-sm text-slate-600">
          Aucune occupation en paramètre. Ouvrez cet écran depuis la fiche d'un locataire ayant une occupation active.
        </p>
      </Card>
    );
  }
  if (!tpl) return <PageSkeleton />;

  const save = async () => {
    setBusy(true);
    try {
      const c = await api.post<{ id: string }>('/contracts', {
        occupancyId,
        monthlyRent,
        deposit,
        startDate,
        durationMonths: durationMonths === '' ? null : Number(durationMonths),
        noticeDays,
        bodyHtml,
      });
      toast.success('Contrat créé en brouillon');
      navigate(`/contracts/${c.id}`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Nouveau contrat" subtitle="Pré-rempli depuis l'occupation ; relisez puis créez le brouillon." />
      <Card>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Loyer mensuel (FCFA)</span>
            <input type="number" min={1} value={monthlyRent} onChange={(e) => setMonthlyRent(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Caution (FCFA)</span>
            <input type="number" min={0} value={deposit} onChange={(e) => setDeposit(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Date de début</span>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Durée (mois) — vide = indéterminée</span>
            <input type="number" min={1} max={240} value={durationMonths} onChange={(e) => setDuration(e.target.value === '' ? '' : Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Préavis (jours)</span>
            <input type="number" min={0} max={365} value={noticeDays} onChange={(e) => setNotice(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
        </div>
      </Card>

      <Card>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Corps du contrat (HTML)</h2>
          <button
            type="button"
            onClick={() => setBodyHtml(tpl.bodyHtml)}
            className="text-xs text-brand hover:underline"
          >
            Réinitialiser depuis le modèle
          </button>
        </div>
        <textarea
          value={bodyHtml}
          onChange={(e) => setBodyHtml(e.target.value)}
          className="h-80 w-full rounded-lg border border-slate-300 p-3 font-mono text-xs"
        />
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-slate-600">Prévisualiser le rendu</summary>
          <div className="mt-2 max-h-96 overflow-auto rounded-lg bg-slate-50 p-4 text-sm" dangerouslySetInnerHTML={{ __html: bodyHtml }} />
        </details>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => navigate(-1)}>Annuler</Button>
        <Button onClick={save} disabled={busy}>Créer le brouillon</Button>
      </div>
    </div>
  );
}
