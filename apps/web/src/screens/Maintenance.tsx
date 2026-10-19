// Tickets de maintenance : liste filtrable + création rapide + résolution avec coût.
// Les actions sensibles (résoudre, assigner) sont réservées à OWNER/MANAGER.
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  MAINTENANCE_PRIORITIES, MAINTENANCE_STATUSES,
  type MaintenancePriority, type MaintenanceStatus,
} from '@bailo/shared';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatDate, formatFcfa } from '../lib/format';
import { Badge, Button, Card, PageHeader, PageSkeleton, type Tone } from '../components/ui';
import { useToast } from '../components/Toast';
import { PlusIcon, WrenchIcon } from '../components/icons';

interface Site { id: string; name: string }
interface Unit { id: string; code: string; siteId: string }
interface Ticket {
  id: string; title: string; description: string | null;
  priority: MaintenancePriority; status: MaintenanceStatus;
  reportedAt: string; resolvedAt: string | null; cost: number | null;
  assignedTo: string | null; assignedPhone: string | null;
  site: { name: string } | null; unit: { code: string } | null;
}

const PRIO_LABEL: Record<MaintenancePriority, string> = { LOW: 'Faible', NORMAL: 'Normale', HIGH: 'Haute', URGENT: 'Urgente' };
const PRIO_TONE: Record<MaintenancePriority, Tone> = { LOW: 'slate', NORMAL: 'brand', HIGH: 'amber', URGENT: 'red' };
const STATUS_LABEL: Record<MaintenanceStatus, string> = {
  OPEN: 'Ouvert', ASSIGNED: 'Assigné', IN_PROGRESS: 'En cours', DONE: 'Résolu', CANCELLED: 'Annulé',
};
const STATUS_TONE: Record<MaintenanceStatus, Tone> = {
  OPEN: 'amber', ASSIGNED: 'brand', IN_PROGRESS: 'brand', DONE: 'emerald', CANCELLED: 'slate',
};

export function Maintenance() {
  const toast = useToast();
  const { user } = useAuth();
  const canManage = user?.role === 'OWNER' || user?.role === 'MANAGER';
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [filter, setFilter] = useState<MaintenanceStatus | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState({ siteId: '', unitId: '', title: '', description: '', priority: 'NORMAL' as MaintenancePriority });
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    const q = filter ? `?status=${filter}` : '';
    api.get<Ticket[]>(`/maintenance${q}`).then(setTickets).catch(() => setTickets([]));
  }, [filter]);
  useEffect(reload, [reload]);
  useEffect(() => {
    api.get<Site[]>('/sites').then(setSites).catch(() => setSites([]));
    api.get<Unit[]>('/units').then(setUnits).catch(() => setUnits([]));
  }, []);

  const counts = useMemo(() => {
    const c: Record<MaintenanceStatus, number> = { OPEN: 0, ASSIGNED: 0, IN_PROGRESS: 0, DONE: 0, CANCELLED: 0 };
    (tickets ?? []).forEach((t) => { c[t.status]++; });
    return c;
  }, [tickets]);

  if (!tickets) return <PageSkeleton />;

  const unitsOfSite = draft.siteId ? units.filter((u) => u.siteId === draft.siteId) : [];

  const save = async () => {
    if (!draft.siteId || !draft.title) { toast.error('Site et titre requis'); return; }
    setBusy(true);
    try {
      await api.post('/maintenance', {
        siteId: draft.siteId, unitId: draft.unitId || undefined,
        title: draft.title, description: draft.description || undefined,
        priority: draft.priority, photoKeys: [],
      });
      toast.success('Ticket créé');
      setShowCreate(false);
      setDraft({ siteId: '', unitId: '', title: '', description: '', priority: 'NORMAL' });
      reload();
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erreur'); }
    finally { setBusy(false); }
  };

  const changeStatus = async (id: string, status: MaintenanceStatus) => {
    try {
      await api.patch(`/maintenance/${id}`, { status });
      reload();
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erreur'); }
  };

  const assign = async (id: string) => {
    const name = window.prompt('Nom du prestataire ?');
    if (!name) return;
    const phone = window.prompt('Numéro (facultatif)') ?? '';
    try {
      await api.patch(`/maintenance/${id}`, { assignedTo: name, assignedPhone: phone || undefined, status: 'ASSIGNED' });
      toast.success('Prestataire assigné');
      reload();
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erreur'); }
  };

  const resolve = async (id: string) => {
    const raw = window.prompt('Coût final (FCFA) ?');
    if (raw === null) return;
    const cost = Number(raw);
    if (Number.isNaN(cost) || cost < 0) { toast.error('Coût invalide'); return; }
    const note = window.prompt('Note (facultatif)') ?? '';
    try {
      await api.post(`/maintenance/${id}/resolve`, { cost, note: note || undefined, createExpense: cost > 0 });
      toast.success('Ticket résolu, dépense créée');
      reload();
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erreur'); }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Maintenance"
        subtitle="Tickets de réparation — photo, prestataire, coût ; chaque clôture crée automatiquement la dépense liée."
        actions={<Button onClick={() => setShowCreate(true)}><PlusIcon className="mr-1 h-4 w-4" /> Nouveau ticket</Button>}
      />

      <div className="flex flex-wrap gap-2 print:hidden">
        <button type="button" onClick={() => setFilter(null)}
          className={`rounded-full px-3 py-1 text-xs font-medium ring-1 transition ${!filter ? 'bg-brand text-white ring-brand' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50'}`}>
          Tous · {tickets.length}
        </button>
        {MAINTENANCE_STATUSES.map((s) => (
          <button key={s} type="button" onClick={() => setFilter(s)}
            className={`rounded-full px-3 py-1 text-xs font-medium ring-1 transition ${filter === s ? 'bg-brand text-white ring-brand' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50'}`}>
            {STATUS_LABEL[s]} · {counts[s]}
          </button>
        ))}
      </div>

      <Card>
        {tickets.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-500">
            <WrenchIcon className="mx-auto h-10 w-10 opacity-40" />
            <p className="mt-2">Aucun ticket {filter ? `au statut « ${STATUS_LABEL[filter]} »` : 'pour le moment'}.</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {tickets.map((t) => (
              <li key={t.id} className="py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={PRIO_TONE[t.priority]}>{PRIO_LABEL[t.priority]}</Badge>
                  <Badge tone={STATUS_TONE[t.status]}>{STATUS_LABEL[t.status]}</Badge>
                  <span className="font-medium text-slate-900">{t.title}</span>
                  <span className="text-xs text-slate-500">
                    · {t.site?.name ?? '—'}{t.unit?.code ? ` · ${t.unit.code}` : ' · commun'}
                    · {formatDate(t.reportedAt)}
                  </span>
                  <span className="ml-auto flex gap-1 text-xs">
                    {canManage && t.status === 'OPEN' && <Button variant="ghost" size="sm" onClick={() => assign(t.id)}>Assigner</Button>}
                    {canManage && t.status === 'ASSIGNED' && <Button variant="ghost" size="sm" onClick={() => changeStatus(t.id, 'IN_PROGRESS')}>Démarrer</Button>}
                    {canManage && (t.status === 'ASSIGNED' || t.status === 'IN_PROGRESS') && <Button variant="success" size="sm" onClick={() => resolve(t.id)}>Résoudre</Button>}
                    {canManage && t.status !== 'DONE' && t.status !== 'CANCELLED' && <Button variant="ghost" size="sm" onClick={() => changeStatus(t.id, 'CANCELLED')}>Annuler</Button>}
                  </span>
                </div>
                {t.description && <p className="mt-1 text-sm text-slate-600">{t.description}</p>}
                {t.assignedTo && (
                  <p className="mt-1 text-xs text-slate-500">
                    Prestataire : {t.assignedTo}{t.assignedPhone ? ` · ${t.assignedPhone}` : ''}
                  </p>
                )}
                {t.resolvedAt && (
                  <p className="mt-1 text-xs text-emerald-700">
                    Résolu le {formatDate(t.resolvedAt)}
                    {t.cost ? ` · ${formatFcfa(t.cost)}` : ''}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog">
          <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-base font-semibold">Nouveau ticket</h3>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className="text-slate-600">Cité</span>
                <select value={draft.siteId} onChange={(e) => setDraft((d) => ({ ...d, siteId: e.target.value, unitId: '' }))}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">
                  <option value="">— Choisir —</option>
                  {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
              <label className="text-sm">
                <span className="text-slate-600">Unité (optionnel)</span>
                <select value={draft.unitId} onChange={(e) => setDraft((d) => ({ ...d, unitId: e.target.value }))}
                  disabled={!draft.siteId}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100">
                  <option value="">Commun au site</option>
                  {unitsOfSite.map((u) => <option key={u.id} value={u.id}>{u.code}</option>)}
                </select>
              </label>
              <label className="text-sm sm:col-span-2">
                <span className="text-slate-600">Titre</span>
                <input value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                  placeholder="Fuite d'eau dans la douche"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
              </label>
              <label className="text-sm sm:col-span-2">
                <span className="text-slate-600">Description (facultatif)</span>
                <textarea value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                  rows={3} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
              </label>
              <label className="text-sm">
                <span className="text-slate-600">Priorité</span>
                <select value={draft.priority} onChange={(e) => setDraft((d) => ({ ...d, priority: e.target.value as MaintenancePriority }))}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">
                  {MAINTENANCE_PRIORITIES.map((p) => <option key={p} value={p}>{PRIO_LABEL[p]}</option>)}
                </select>
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowCreate(false)}>Annuler</Button>
              <Button onClick={save} disabled={busy}>Créer</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
