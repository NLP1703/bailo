import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  UNIT_TYPES,
  UNIT_MANUAL_STATUSES,
  type UnitType,
  type UnitManualStatus,
} from '@citegest/shared';
import { api } from '../lib/api';
import { uploadFile } from '../lib/upload';
import { SignedImage } from '../components/SignedImage';

interface Unit {
  id: string;
  code: string;
  type: UnitType;
  baseRent: number;
  chargesIncluded: boolean;
  shared: boolean;
  capacity: number;
  manualStatus: UnitManualStatus;
  amenities: string[];
  photoKeys: string[];
  activeOccupancyId: string | null;
  occupantName: string | null;
}

export function UnitEdit() {
  const { t } = useTranslation();
  const { id } = useParams();
  const [unit, setUnit] = useState<Unit | null>(null);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    api
      .get<Unit>(`/units/${id}`)
      .then(setUnit)
      .catch(() => setUnit(null));
  }, [id]);

  if (!unit) return <p className="text-slate-500">{t('common.loading')}</p>;

  const set = <K extends keyof Unit>(key: K, value: Unit[K]) => {
    setUnit({ ...unit, [key]: value });
    setSaved(false);
  };

  const addPhoto = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const key = await uploadFile(file, 'unit-photo');
      set('photoKeys', [...unit.photoKeys, key]);
    } catch {
      /* ignore */
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    await api.patch(`/units/${unit.id}`, {
      code: unit.code,
      type: unit.type,
      baseRent: unit.baseRent,
      chargesIncluded: unit.chargesIncluded,
      shared: unit.shared,
      capacity: unit.capacity,
      manualStatus: unit.manualStatus,
      amenities: unit.amenities,
      photoKeys: unit.photoKeys,
    });
    setSaved(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">
          {t('unit.title')} · {unit.code}
        </h1>
        {unit.activeOccupancyId && (
          <Link
            to={`/collect?occupancyId=${unit.activeOccupancyId}&room=${unit.code}`}
            className="rounded bg-brand px-3 py-1 text-sm text-white"
          >
            {t('nav.collect')}
          </Link>
        )}
      </div>
      {unit.occupantName && (
        <p className="text-sm text-slate-500">
          {t('room.occupant')} : {unit.occupantName}
        </p>
      )}

      <div className="space-y-3 rounded-lg bg-white p-3 shadow-sm">
        <label className="block text-sm">
          {t('unit.code')}
          <input
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            value={unit.code}
            onChange={(e) => set('code', e.target.value)}
          />
        </label>
        <div className="flex gap-2">
          <label className="flex-1 text-sm">
            {t('unit.type')}
            <select
              className="mt-1 w-full rounded border border-slate-300 px-2 py-2"
              value={unit.type}
              onChange={(e) => set('type', e.target.value as UnitType)}
            >
              {UNIT_TYPES.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </label>
          <label className="flex-1 text-sm">
            {t('unit.status')}
            <select
              className="mt-1 w-full rounded border border-slate-300 px-2 py-2"
              value={unit.manualStatus}
              onChange={(e) => set('manualStatus', e.target.value as UnitManualStatus)}
            >
              {UNIT_MANUAL_STATUSES.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex gap-2">
          <label className="flex-1 text-sm">
            {t('newEntry.rent')}
            <input
              inputMode="numeric"
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              value={unit.baseRent}
              onChange={(e) => set('baseRent', Number(e.target.value.replace(/\D/g, '')) || 0)}
            />
          </label>
          <label className="w-24 text-sm">
            {t('unit.capacity')}
            <input
              inputMode="numeric"
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              value={unit.capacity}
              onChange={(e) => set('capacity', Number(e.target.value.replace(/\D/g, '')) || 1)}
            />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={unit.chargesIncluded}
            onChange={(e) => set('chargesIncluded', e.target.checked)}
          />
          {t('unit.chargesIncluded')}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={unit.shared}
            onChange={(e) => set('shared', e.target.checked)}
          />
          {t('unit.shared')}
        </label>
        <label className="block text-sm">
          {t('unit.amenities')}
          <input
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            value={unit.amenities.join(', ')}
            onChange={(e) =>
              set(
                'amenities',
                e.target.value
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean),
              )
            }
            placeholder={t('unit.amenitiesHint')}
          />
        </label>
      </div>

      <div className="space-y-2 rounded-lg bg-white p-3 shadow-sm">
        <div className="text-sm font-medium">{t('unit.photos')}</div>
        <div className="grid grid-cols-3 gap-2">
          {unit.photoKeys.map((key) => (
            <div key={key} className="relative">
              <SignedImage
                objectKey={key}
                alt={unit.code}
                className="aspect-square w-full rounded object-cover"
              />
              <button
                onClick={() =>
                  set(
                    'photoKeys',
                    unit.photoKeys.filter((k) => k !== key),
                  )
                }
                className="absolute right-1 top-1 rounded-full bg-black/60 px-1.5 text-xs text-white"
                aria-label={t('file.remove')}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <label className="inline-block cursor-pointer rounded border border-slate-300 px-3 py-2 text-sm">
          {uploading ? t('file.uploading') : t('unit.addPhoto')}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => void addPhoto(e.target.files?.[0])}
          />
        </label>
      </div>

      {saved && (
        <p className="rounded bg-emerald-50 p-2 text-sm text-emerald-700">{t('templates.saved')}</p>
      )}
      <button onClick={save} className="w-full rounded bg-brand py-3 font-semibold text-white">
        {t('common.save')}
      </button>
    </div>
  );
}
