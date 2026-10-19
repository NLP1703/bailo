// Compteurs eau / électricité d'une unité : liste + ajout compteur + saisie relevé mensuel.
// La charge EAU / ELECTRICITE sur l'occupation active est créée automatiquement côté API.
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { METER_TYPES, type MeterType } from '@bailo/shared';
import { api, ApiError } from '../lib/api';
import { formatDate, formatFcfa } from '../lib/format';
import { Badge, Button, Card, PageHeader, PageSkeleton } from '../components/ui';
import { useToast } from '../components/Toast';
import { GaugeIcon, PlusIcon } from '../components/icons';

interface Reading {
  id: string; readAt: string; value: number; consumption: number;
  chargeId: string | null; note: string | null;
}
interface Meter {
  id: string; type: MeterType; identifier: string | null;
  unitPrice: number; unitLabel: string; active: boolean;
  readings: Reading[];
}

const TYPE_LABEL: Record<MeterType, string> = { WATER: 'Eau', ELECTRICITY: 'Électricité' };

export function Meters() {
  const [params] = useSearchParams();
  const unitId = params.get('unitId') ?? '';
  const toast = useToast();
  const [meters, setMeters] = useState<Meter[] | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [draft, setDraft] = useState({ type: 'ELECTRICITY' as MeterType, identifier: '', unitPrice: '', unitLabel: 'kWh' });
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    if (!unitId) return;
    api.get<Meter[]>(`/meters/for-unit/${unitId}`).then(setMeters).catch(() => setMeters([]));
  }, [unitId]);
  useEffect(reload, [reload]);

  if (!unitId) return <Card><p className="text-sm text-slate-600">Ouvrez cet écran depuis une chambre (?unitId=…).</p></Card>;
  if (!meters) return <PageSkeleton />;

  const addMeter = async () => {
    const price = Number(draft.unitPrice);
    if (!price) { toast.error('Prix unitaire requis'); return; }
    setBusy(true);
    try {
      await api.post('/meters', {
        unitId, type: draft.type,
        identifier: draft.identifier || undefined,
        unitPrice: price,
        unitLabel: draft.unitLabel,
      });
      toast.success('Compteur ajouté');
      setShowNew(false);
      setDraft({ type: 'ELECTRICITY', identifier: '', unitPrice: '', unitLabel: 'kWh' });
      reload();
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erreur'); }
    finally { setBusy(false); }
  };

  const recordReading = async (meter: Meter) => {
    const prev = meter.readings[0]?.value ?? 0;
    const raw = window.prompt(`Nouveau relevé ${TYPE_LABEL[meter.type]} (dernier : ${prev})`);
    if (raw === null) return;
    const value = Number(raw);
    if (Number.isNaN(value) || value < prev) {
      toast.error('Valeur invalide (doit être ≥ dernier relevé)');
      return;
    }
    try {
      await api.post('/meters/readings', { meterId: meter.id, value, billOccupancy: true });
      const conso = value - prev;
      toast.success(`Relevé enregistré · ${conso} ${meter.unitLabel} · charge ${formatFcfa(conso * meter.unitPrice)} générée`);
      reload();
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erreur'); }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Compteurs"
        subtitle="Eau / électricité — relevé mensuel + refacturation automatique au locataire actif."
        actions={<Button onClick={() => setShowNew(true)}><PlusIcon className="mr-1 h-4 w-4" /> Ajouter un compteur</Button>}
      />

      {meters.length === 0 ? (
        <Card>
          <div className="py-10 text-center text-sm text-slate-500">
            <GaugeIcon className="mx-auto h-10 w-10 opacity-40" />
            <p className="mt-2">Aucun compteur sur cette unité.</p>
          </div>
        </Card>
      ) : (
        meters.map((m) => (
          <Card key={m.id}>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={m.type === 'WATER' ? 'brand' : 'amber'}>{TYPE_LABEL[m.type]}</Badge>
              {m.identifier && <span className="font-mono text-xs text-slate-500">N° {m.identifier}</span>}
              <span className="text-sm text-slate-600">
                Prix : <strong>{formatFcfa(m.unitPrice)}</strong> / {m.unitLabel || 'unité'}
              </span>
              {!m.active && <Badge tone="slate">Inactif</Badge>}
              <Button className="ml-auto" variant="success" size="sm" onClick={() => recordReading(m)}>
                Saisir un relevé
              </Button>
            </div>
            {m.readings.length === 0 ? (
              <p className="mt-3 text-xs text-slate-500">Aucun relevé pour le moment.</p>
            ) : (
              <table className="mt-3 w-full text-sm">
                <thead className="text-xs uppercase text-slate-500">
                  <tr><th className="py-1 text-left">Date</th><th className="py-1 text-right">Relevé</th><th className="py-1 text-right">Conso</th><th className="py-1 text-right">Refacturé</th><th className="py-1 text-left">Facturé ?</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {m.readings.map((r) => (
                    <tr key={r.id}>
                      <td className="py-1 font-mono text-xs">{formatDate(r.readAt)}</td>
                      <td className="py-1 text-right">{r.value}</td>
                      <td className="py-1 text-right">{r.consumption > 0 ? `+${r.consumption}` : '—'} {r.consumption > 0 ? m.unitLabel : ''}</td>
                      <td className="py-1 text-right">{r.consumption > 0 ? formatFcfa(r.consumption * m.unitPrice) : '—'}</td>
                      <td className="py-1">{r.chargeId ? <Badge tone="emerald">Charge créée</Badge> : <span className="text-xs text-slate-400">non</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        ))
      )}

      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-base font-semibold">Nouveau compteur</h3>
            <div className="mt-3 space-y-3">
              <label className="block text-sm">
                <span className="text-slate-600">Type</span>
                <select value={draft.type}
                  onChange={(e) => {
                    const type = e.target.value as MeterType;
                    setDraft((d) => ({ ...d, type, unitLabel: type === 'WATER' ? 'm³' : 'kWh' }));
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">
                  {METER_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-slate-600">N° de compteur (facultatif)</span>
                <input value={draft.identifier} onChange={(e) => setDraft((d) => ({ ...d, identifier: e.target.value }))}
                  placeholder="ENEO 123456 / Camwater 789"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="text-slate-600">Prix unitaire (FCFA)</span>
                  <input type="number" min={0} value={draft.unitPrice}
                    onChange={(e) => setDraft((d) => ({ ...d, unitPrice: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
                </label>
                <label className="block text-sm">
                  <span className="text-slate-600">Unité</span>
                  <input value={draft.unitLabel} onChange={(e) => setDraft((d) => ({ ...d, unitLabel: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
                </label>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowNew(false)}>Annuler</Button>
              <Button onClick={addMeter} disabled={busy}>Ajouter</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
