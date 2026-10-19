// États des lieux d'une occupation : liste des EDL + création rapide (entrée/sortie)
// avec items pièce par pièce, et résumé de caution si l'occupation est connue.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  INSPECTION_CONDITIONS,
  INSPECTION_KINDS,
  type InspectionCondition,
  type InspectionKind,
} from '@bailo/shared';
import { api, ApiError } from '../lib/api';
import { formatDate, formatFcfa } from '../lib/format';
import { Badge, Button, Card, PageHeader, PageSkeleton } from '../components/ui';
import { useToast } from '../components/Toast';

interface InspectionItem {
  id: string; room: string; element: string; condition: InspectionCondition;
  note: string | null; estimatedCost: number | null;
}
interface Inspection {
  id: string; kind: InspectionKind; performedAt: string; summary: string | null;
  withholding: number; withholdingNote: string | null;
  signedByTenantAt: string | null; tenantSignatureName: string | null;
  items: InspectionItem[];
}
interface DepositSummary {
  deposit: number; totalWithheld: number; refundable: number;
  withholdings: { inspectionId: string; amount: number; note: string | null }[];
}

const KIND_LABEL: Record<InspectionKind, string> = { ENTRY: 'Entrée', EXIT: 'Sortie' };
const COND_LABEL: Record<InspectionCondition, string> = {
  GOOD: 'Bon état', FAIR: 'Correct', POOR: 'Usé', DAMAGED: 'Dégradé',
};
const COND_TONE: Record<InspectionCondition, 'emerald' | 'amber' | 'slate' | 'red'> = {
  GOOD: 'emerald', FAIR: 'amber', POOR: 'slate', DAMAGED: 'red',
};

// Pièces et éléments proposés par défaut pour accélérer la saisie.
const ROOMS_DEFAULT = ['Salon', 'Chambre', 'Cuisine', 'Douche', 'Toilettes'];
const ELEMENTS_DEFAULT = ['Murs', 'Sol', 'Plafond', 'Porte', 'Fenêtre', 'Serrure', 'Prise', 'Robinet', 'Ampoule'];

interface Draft {
  room: string; element: string; condition: InspectionCondition;
  note: string; estimatedCost: string;
}
const emptyDraft = (): Draft => ({ room: ROOMS_DEFAULT[0]!, element: ELEMENTS_DEFAULT[0]!, condition: 'GOOD', note: '', estimatedCost: '' });

export function Inspections() {
  const [params] = useSearchParams();
  const occupancyId = params.get('occupancyId') ?? '';
  const toast = useToast();
  const [list, setList] = useState<Inspection[] | null>(null);
  const [deposit, setDeposit] = useState<DepositSummary | null>(null);
  const [kind, setKind] = useState<InspectionKind>('ENTRY');
  const [summary, setSummary] = useState('');
  const [items, setItems] = useState<Draft[]>([emptyDraft()]);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    if (!occupancyId) return;
    Promise.all([
      api.get<Inspection[]>(`/inspections?occupancyId=${occupancyId}`),
      api.get<DepositSummary>(`/inspections/deposit-summary?occupancyId=${occupancyId}`).catch(() => null),
    ]).then(([l, d]) => { setList(l); setDeposit(d); });
  }, [occupancyId]);
  useEffect(reload, [reload]);

  const dmgTotal = useMemo(
    () => items.reduce((s, it) => s + (it.condition === 'DAMAGED' ? Number(it.estimatedCost || 0) : 0), 0),
    [items],
  );

  if (!occupancyId) {
    return <Card><p className="text-sm text-slate-600">Ouvrez cet écran depuis la fiche d'un locataire (?occupancyId=…).</p></Card>;
  }
  if (!list) return <PageSkeleton />;

  const save = async () => {
    if (items.length === 0) { toast.error('Ajoutez au moins un élément.'); return; }
    setBusy(true);
    try {
      await api.post('/inspections', {
        occupancyId, kind, summary: summary || undefined,
        photoKeys: [],
        items: items.map((it) => ({
          room: it.room, element: it.element, condition: it.condition,
          note: it.note || undefined,
          photoKeys: [],
          estimatedCost: it.estimatedCost ? Number(it.estimatedCost) : undefined,
        })),
      });
      toast.success(`État des lieux ${KIND_LABEL[kind]} enregistré`);
      setSummary(''); setItems([emptyDraft()]);
      reload();
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erreur'); }
    finally { setBusy(false); }
  };

  const closeExit = async (inspId: string, currentWithhold: number) => {
    const raw = window.prompt('Retenue totale sur caution (FCFA)', String(currentWithhold));
    if (raw === null) return;
    const amount = Number(raw);
    if (Number.isNaN(amount) || amount < 0) { toast.error('Montant invalide'); return; }
    const note = window.prompt('Motif (facultatif)') ?? '';
    const name = window.prompt('Nom tapé par le locataire (facultatif)') ?? '';
    try {
      await api.post(`/inspections/${inspId}/close`, {
        withholding: amount,
        withholdingNote: note || undefined,
        tenantSignatureName: name || undefined,
      });
      toast.success('Clôture enregistrée');
      reload();
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erreur'); }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="États des lieux"
        subtitle="Entrée et sortie — chaque pièce et chaque élément est noté, avec retenue sur caution si nécessaire."
      />

      {deposit && (
        <Card>
          <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
            <div><div className="text-slate-500">Caution versée</div><div className="text-xl font-semibold">{formatFcfa(deposit.deposit)}</div></div>
            <div><div className="text-slate-500">Retenues cumulées</div><div className="text-xl font-semibold text-amber-700">{formatFcfa(deposit.totalWithheld)}</div></div>
            <div><div className="text-slate-500">À rembourser</div><div className="text-xl font-semibold text-emerald-700">{formatFcfa(deposit.refundable)}</div></div>
          </div>
        </Card>
      )}

      <Card>
        <h2 className="mb-3 text-sm font-semibold">Nouvel état des lieux</h2>
        <div className="mb-3 flex items-center gap-3">
          <label className="text-sm">
            <span className="mr-2 text-slate-500">Type</span>
            <select value={kind} onChange={(e) => setKind(e.target.value as InspectionKind)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">
              {INSPECTION_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
            </select>
          </label>
          <label className="flex-1 text-sm">
            <input value={summary} onChange={(e) => setSummary(e.target.value)}
              placeholder="Commentaire général (optionnel)"
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
          </label>
        </div>

        <div className="space-y-2">
          {items.map((it, i) => (
            <div key={i} className="grid grid-cols-12 items-end gap-2 rounded-lg bg-slate-50 p-2">
              <label className="col-span-6 sm:col-span-3 text-xs">
                <span className="text-slate-500">Pièce</span>
                <input list="rooms" value={it.room} onChange={(e) => update(i, { room: e.target.value })}
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1" />
              </label>
              <label className="col-span-6 sm:col-span-3 text-xs">
                <span className="text-slate-500">Élément</span>
                <input list="elements" value={it.element} onChange={(e) => update(i, { element: e.target.value })}
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1" />
              </label>
              <label className="col-span-6 sm:col-span-2 text-xs">
                <span className="text-slate-500">État</span>
                <select value={it.condition} onChange={(e) => update(i, { condition: e.target.value as InspectionCondition })}
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1">
                  {INSPECTION_CONDITIONS.map((c) => <option key={c} value={c}>{COND_LABEL[c]}</option>)}
                </select>
              </label>
              <label className="col-span-6 sm:col-span-2 text-xs">
                <span className="text-slate-500">Coût (FCFA)</span>
                <input type="number" min={0} value={it.estimatedCost}
                  disabled={it.condition !== 'DAMAGED'}
                  onChange={(e) => update(i, { estimatedCost: e.target.value })}
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1 disabled:bg-slate-100" />
              </label>
              <label className="col-span-10 sm:col-span-1 text-xs">
                <span className="text-slate-500">Note</span>
                <input value={it.note} onChange={(e) => update(i, { note: e.target.value })}
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1" />
              </label>
              <button type="button" onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))}
                className="col-span-2 sm:col-span-1 text-xs text-red-600 hover:underline">
                Retirer
              </button>
            </div>
          ))}
          <datalist id="rooms">{ROOMS_DEFAULT.map((r) => <option key={r} value={r} />)}</datalist>
          <datalist id="elements">{ELEMENTS_DEFAULT.map((e) => <option key={e} value={e} />)}</datalist>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="ghost" onClick={() => setItems((xs) => [...xs, emptyDraft()])}>+ Ajouter un élément</Button>
          {kind === 'EXIT' && dmgTotal > 0 && (
            <span className="text-xs text-amber-700">
              Retenue potentielle : {formatFcfa(dmgTotal)} (basée sur les éléments dégradés)
            </span>
          )}
          <span className="ml-auto"></span>
          <Button onClick={save} disabled={busy}>Enregistrer l'état des lieux</Button>
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold">Historique</h2>
        {list.length === 0 ? (
          <p className="text-sm text-slate-500">Aucun état des lieux pour cette occupation.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {list.map((i) => (
              <li key={i.id} className="py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={i.kind === 'ENTRY' ? 'emerald' : 'amber'}>{KIND_LABEL[i.kind]}</Badge>
                  <span className="text-sm font-medium">{formatDate(i.performedAt)}</span>
                  <span className="text-xs text-slate-500">· {i.items.length} éléments</span>
                  {i.withholding > 0 && (
                    <Badge tone="red">Retenue {formatFcfa(i.withholding)}</Badge>
                  )}
                  {i.signedByTenantAt && <Badge tone="brand">Signé {formatDate(i.signedByTenantAt)}</Badge>}
                  <span className="ml-auto">
                    {i.kind === 'EXIT' && !i.signedByTenantAt && (
                      <Button variant="ghost" onClick={() => closeExit(i.id, i.withholding)}>Clôturer</Button>
                    )}
                  </span>
                </div>
                {i.summary && <p className="mt-1 text-sm text-slate-600">{i.summary}</p>}
                {i.items.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs text-slate-600">
                    {i.items.map((it) => (
                      <li key={it.id} className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-slate-700">{it.room} · {it.element}</span>
                        <Badge tone={COND_TONE[it.condition]}>{COND_LABEL[it.condition]}</Badge>
                        {it.estimatedCost ? <span>→ {formatFcfa(it.estimatedCost)}</span> : null}
                        {it.note && <span className="italic">{it.note}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );

  function update(i: number, patch: Partial<Draft>) {
    setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  }
}
