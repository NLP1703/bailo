import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { db } from '../lib/db';
import { useAuth } from '../lib/auth';
import { UNIT_COLOR_CLASS } from '../lib/format';
import { PageHeader, Select, EmptyState } from '../components/ui';
import { DoorIcon } from '../components/icons';

interface Site {
  id: string;
  name: string;
}
interface Unit {
  id: string;
  code: string;
  color: string;
  activeOccupancyId: string | null;
  tenantName: string | null;
  nextDueDate: string | null;
  nextDueAmount: number | null;
  reservedFor: string | null;
  reservedUntil: string | null;
}

/** Formate un prénom NOM en « Prénom N. » pour tenir dans une case carrée. */
function shortName(full: string | null | undefined): string {
  if (!full) return '';
  const parts = full.trim().split(/\s+/).filter(Boolean);
  const first = parts[0] ?? '';
  if (parts.length <= 1) return first;
  const last = parts[parts.length - 1] ?? '';
  const initial = last[0] ?? '';
  return initial ? `${first} ${initial}.` : first;
}

/** Date ISO → « 15/10 » pour tenir dans une case carrée. */
function shortDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function Rooms() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canManage = user?.role === 'OWNER' || user?.role === 'MANAGER';
  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState<string>('');
  const [units, setUnits] = useState<Unit[]>([]);

  useEffect(() => {
    api.get<Site[]>('/sites').then((s) => {
      setSites(s);
      if (s[0]) setSiteId(s[0].id);
    });
  }, []);

  useEffect(() => {
    if (!siteId) return;
    api
      .get<Unit[]>(`/units?siteId=${siteId}`)
      .then((u) => {
        setUnits(u);
        void db.units.bulkPut(u.map((x) => ({ ...x, siteId })));
      })
      .catch(() => {
        void db.units
          .where('siteId')
          .equals(siteId)
          .toArray()
          .then((cached) => setUnits(cached as unknown as Unit[]));
      });
  }, [siteId]);

  const open = (u: Unit) => {
    // Gardien : accès direct à l'encaissement sur une chambre occupée (parcours rapide).
    // Propriétaire / gérant : fiche de l'unité (édition, photos, encaissement).
    if (canManage) {
      navigate(`/units/${u.id}`);
    } else if (u.activeOccupancyId) {
      navigate(`/collect?occupancyId=${u.activeOccupancyId}&room=${u.code}`);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('rooms.title')}
        subtitle={t('pageSub.rooms')}
        action={
          sites.length > 0 && (
            <Select value={siteId} onChange={setSiteId}>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          )
        }
      />

      {units.length === 0 ? (
        <EmptyState icon={DoorIcon} message={t('rooms.title')} />
      ) : (
        // Grille responsive : plus large sur grand écran (plus de chambres visibles
        // d'un seul coup d'œil), plus confortable au doigt sur téléphone (3 colonnes
        // ≈ carrés de 110 px, tap sans mire).
        <div className="grid grid-cols-3 gap-2.5 xs:grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10">
          {units.map((u) => {
            // Détermine quoi afficher sous le code selon l'état de la case.
            const isReserved = u.color === 'BLUE';
            const isOccupied = u.color === 'GREEN' || u.color === 'ORANGE' || u.color === 'RED';
            const name = isReserved ? u.reservedFor : u.tenantName;
            const dateIso = isReserved ? u.reservedUntil : u.nextDueDate;
            const dateLabel = isReserved && dateIso
              ? `arrive ${shortDate(dateIso)}`
              : dateIso
                ? shortDate(dateIso)
                : '';
            const bgClass = UNIT_COLOR_CLASS[u.color] ?? 'bg-slate-300';
            const textOnDark = isReserved || isOccupied; // fonds colorés → texte blanc
            return (
              <button
                key={u.id}
                onClick={() => open(u)}
                aria-label={name ? `${u.code} — ${name}` : u.code}
                className={`flex aspect-square flex-col items-stretch justify-between rounded-xl p-2 text-left shadow-sm transition active:scale-95 ${bgClass} ${textOnDark ? 'text-white' : 'text-slate-600'}`}
              >
                <span className="text-sm font-bold leading-tight">{u.code}</span>
                {name ? (
                  <span className="min-w-0 flex-1 pt-1">
                    <span className="block truncate text-xs font-semibold leading-tight">
                      {shortName(name)}
                    </span>
                  </span>
                ) : (
                  <span className="flex-1" />
                )}
                {dateLabel && (
                  <span
                    className={`inline-block self-start rounded px-1 py-0.5 text-[10px] font-semibold leading-none ${textOnDark ? 'bg-black/20' : 'bg-slate-100'}`}
                  >
                    {dateLabel}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-2 rounded-xl bg-white p-3 text-xs font-medium text-slate-600 shadow-sm ring-1 ring-slate-100">
        <Legend color="bg-emerald-500" label={t('rooms.upToDate')} />
        <Legend color="bg-amber-500" label={t('rooms.dueSoon')} />
        <Legend color="bg-red-500" label={t('rooms.late')} />
        <Legend color="bg-slate-300" label={t('rooms.free')} />
        <Legend color="bg-sky-500" label={t('rooms.reserved')} />
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block h-3 w-3 rounded-full ${color}`} />
      {label}
    </span>
  );
}
