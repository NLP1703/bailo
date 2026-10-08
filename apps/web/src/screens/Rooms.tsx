import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { db } from '../lib/db';
import { useAuth } from '../lib/auth';
import { UNIT_COLOR_CLASS } from '../lib/format';

interface Site {
  id: string;
  name: string;
}
interface Unit {
  id: string;
  code: string;
  color: string;
  activeOccupancyId: string | null;
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
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{t('rooms.title')}</h1>
        <select
          className="rounded border border-slate-300 px-2 py-1 text-sm"
          value={siteId}
          onChange={(e) => setSiteId(e.target.value)}
        >
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {units.map((u) => (
          <button
            key={u.id}
            onClick={() => open(u)}
            className={`flex aspect-square flex-col items-center justify-center rounded text-xs font-semibold text-white ${UNIT_COLOR_CLASS[u.color] ?? 'bg-slate-300'}`}
          >
            {u.code}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 pt-2 text-xs text-slate-600">
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
    <span className="flex items-center gap-1">
      <span className={`inline-block h-3 w-3 rounded ${color}`} />
      {label}
    </span>
  );
}
