import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  UNIT_TYPES,
  UNIT_MANUAL_STATUSES,
  type UnitType,
  type UnitManualStatus,
} from '@bailo/shared';
import { api } from '../lib/api';
import { uploadFile } from '../lib/upload';
import { SignedImage } from '../components/SignedImage';
import { useConfirm } from '../components/Confirm';
import { useToast } from '../components/Toast';
import { PageHeader, Card, Input, NativeSelect, Button, Label, PageSkeleton } from '../components/ui';
import { XIcon, CheckIcon, PlusIcon } from '../components/icons';

interface Unit {
  id: string;
  code: string;
  type: UnitType;
  baseRent: number;
  furnished: boolean;
  chargesIncluded: boolean;
  shared: boolean;
  capacity: number;
  bedrooms: number | null;
  rooms: string[];
  manualStatus: UnitManualStatus;
  amenities: string[];
  photoKeys: string[];
  activeOccupancyId: string | null;
  occupantName: string | null;
  reservedUntil: string | null;
  reservedFor: string | null;
}

export function UnitEdit() {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const toast = useToast();
  const { id } = useParams();
  const [unit, setUnit] = useState<Unit | null>(null);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [reserving, setReserving] = useState(false);
  const [reserveDate, setReserveDate] = useState('');
  const [reserveName, setReserveName] = useState('');
  const [reserveDeposit, setReserveDeposit] = useState('');
  const [reserveError, setReserveError] = useState<string | null>(null);
  const [reserveBusy, setReserveBusy] = useState(false);
  const todayIso = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    api
      .get<Unit>(`/units/${id}`)
      .then(setUnit)
      .catch(() => setUnit(null));
  }, [id]);

  if (!unit) return <PageSkeleton />;

  const set = <K extends keyof Unit>(key: K, value: Unit[K]) => {
    setUnit({ ...unit, [key]: value });
    setSaved(false);
  };

  const addPhoto = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      // Garde-fou taille (évite les PUT MinIO qui plantent après plusieurs secondes).
      const MAX_MB = 8;
      if (file.size > MAX_MB * 1024 * 1024) {
        throw new Error(`Fichier trop volumineux (max ${MAX_MB} Mo)`);
      }
      const key = await uploadFile(file, 'unit-photo');
      set('photoKeys', [...unit.photoKeys, key]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Échec du dépôt — réessayez.';
      setUploadError(msg);
      console.error('[addPhoto]', err);
    } finally {
      setUploading(false);
    }
  };

  const reserve = async () => {
    if (!unit || !reserveDate) return;
    setReserveBusy(true);
    setReserveError(null);
    try {
      await api.post(`/units/${unit.id}/reserve`, {
        expectedArrivalDate: reserveDate,
        ...(reserveName.trim() ? { tenantName: reserveName.trim() } : {}),
        ...(Number(reserveDeposit) > 0 ? { depositAmount: Number(reserveDeposit) } : {}),
      });
      // Recharge l'unité pour voir le nouveau statut
      const fresh = await api.get<Unit>(`/units/${unit.id}`);
      setUnit(fresh);
      setReserving(false);
      setReserveDate('');
      setReserveName('');
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Impossible de réserver cette chambre.';
      setReserveError(msg);
    } finally {
      setReserveBusy(false);
    }
  };

  const cancelReservation = async () => {
    if (!unit) return;
    const ok = await confirm({
      title: t('confirm.cancelReservationTitle', { unit: unit.code }),
      message: t('confirm.cancelReservationMsg', { name: unit.reservedFor ?? '—' }),
      confirmLabel: t('confirm.cancelReservationOk'),
      cancelLabel: t('confirm.keep'),
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api.post(`/units/${unit.id}/unreserve`, {});
      const fresh = await api.get<Unit>(`/units/${unit.id}`);
      setUnit(fresh);
      toast.success(t('confirm.reservationCancelled', { unit: unit.code }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('confirm.genericError'));
    }
  };

  const save = async () => {
    await api.patch(`/units/${unit.id}`, {
      code: unit.code,
      type: unit.type,
      baseRent: unit.baseRent,
      furnished: unit.furnished,
      chargesIncluded: unit.chargesIncluded,
      shared: unit.shared,
      capacity: unit.capacity,
      bedrooms: unit.bedrooms,
      rooms: unit.rooms,
      manualStatus: unit.manualStatus,
      amenities: unit.amenities,
      photoKeys: unit.photoKeys,
    });
    setSaved(true);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={`${t('unit.title')} · ${unit.code}`}
        action={
          unit.activeOccupancyId && (
            <Link
              to={`/collect?occupancyId=${unit.activeOccupancyId}&room=${unit.code}`}
              className="inline-flex items-center rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-dark"
            >
              {t('nav.collect')}
            </Link>
          )
        }
      />
      {unit.occupantName && (
        <p className="-mt-2 text-sm text-slate-500">
          {t('room.occupant')} : <span className="font-medium text-slate-700">{unit.occupantName}</span>
        </p>
      )}

      <Card className="space-y-3">
        <div>
          <Label>{t('unit.code')}</Label>
          <Input value={unit.code} onChange={(e) => set('code', e.target.value)} />
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <Label>{t('unit.type')}</Label>
            <NativeSelect value={unit.type} onChange={(e) => set('type', e.target.value as UnitType)}>
              {UNIT_TYPES.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex-1">
            <Label>{t('unit.status')}</Label>
            <NativeSelect
              value={unit.manualStatus}
              onChange={(e) => set('manualStatus', e.target.value as UnitManualStatus)}
            >
              {UNIT_MANUAL_STATUSES.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <Label>{t('newEntry.rent')}</Label>
            <Input
              inputMode="numeric"
              value={unit.baseRent}
              onChange={(e) => set('baseRent', Number(e.target.value.replace(/\D/g, '')) || 0)}
            />
          </div>
          <div className="w-24">
            <Label>{t('unit.capacity')}</Label>
            <Input
              inputMode="numeric"
              value={unit.capacity}
              onChange={(e) => set('capacity', Number(e.target.value.replace(/\D/g, '')) || 1)}
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand/30"
            checked={unit.furnished}
            onChange={(e) => set('furnished', e.target.checked)}
          />
          {t('unit.furnished')}
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand/30"
            checked={unit.chargesIncluded}
            onChange={(e) => set('chargesIncluded', e.target.checked)}
          />
          {t('unit.chargesIncluded')}
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand/30"
            checked={unit.shared}
            onChange={(e) => set('shared', e.target.checked)}
          />
          {t('unit.shared')}
        </label>
        <div>
          <Label>{t('unit.amenities')}</Label>
          <Input
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
        </div>

        {(unit.type === 'MAISON' || unit.type === 'APPARTEMENT') && (
          <div className="flex gap-2">
            <div className="w-28">
              <Label>{t('unit.bedrooms')}</Label>
              <Input
                inputMode="numeric"
                value={unit.bedrooms ?? ''}
                onChange={(e) =>
                  set('bedrooms', e.target.value ? Number(e.target.value.replace(/\D/g, '')) : null)
                }
              />
            </div>
            <div className="flex-1">
              <Label>{t('unit.rooms')}</Label>
              <Input
                value={unit.rooms.join(', ')}
                onChange={(e) =>
                  set(
                    'rooms',
                    e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean),
                  )
                }
                placeholder={t('unit.roomsHint')}
              />
            </div>
          </div>
        )}
      </Card>

      <Card className="space-y-3">
        <Label>{t('unit.photos')}</Label>
        {unit.photoKeys.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {unit.photoKeys.map((key) => (
              <div key={key} className="relative">
                <SignedImage
                  objectKey={key}
                  alt={unit.code}
                  className="aspect-square w-full rounded-lg object-cover ring-1 ring-slate-200"
                />
                <button
                  onClick={() =>
                    set(
                      'photoKeys',
                      unit.photoKeys.filter((k) => k !== key),
                    )
                  }
                  className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-black/80"
                  aria-label={t('file.remove')}
                >
                  <XIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50">
          <PlusIcon className="h-4 w-4" />
          {uploading ? t('file.uploading') : t('unit.addPhoto')}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            // key = nombre de photos : force le reset du <input> après chaque ajout,
            // sinon re-sélectionner le même fichier ne déclenche pas onChange.
            key={unit.photoKeys.length}
            onChange={(e) => void addPhoto(e.target.files?.[0])}
          />
        </label>
        {uploadError && (
          <p className="rounded-lg bg-red-50 p-2 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-200">
            {uploadError}
          </p>
        )}
      </Card>

      {/* Bandeau "Chambre réservée" (RG18 bleu) ─ affiché seulement si RESERVED */}
      {unit.manualStatus === 'RESERVED' && unit.reservedUntil && (
        <div className="flex items-center gap-3 rounded-xl bg-sky-50 p-3 text-sm text-sky-900 ring-1 ring-inset ring-sky-200">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-500 text-white font-bold">
            ✓
          </span>
          <div className="flex-1">
            <div className="font-semibold">
              Chambre réservée{unit.reservedFor ? ` pour ${unit.reservedFor}` : ''}
            </div>
            <div className="text-xs text-sky-700">
              Arrivée prévue le {new Date(unit.reservedUntil).toLocaleDateString('fr-FR')}
              {' · '}la chambre redeviendra disponible automatiquement ce jour-là.
            </div>
          </div>
          <button
            onClick={() => void cancelReservation()}
            className="rounded-md px-2 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-100"
          >
            Annuler
          </button>
        </div>
      )}

      {/* Mini-modale de réservation (inline) ─ apparaît quand on clique sur Réserver */}
      {reserving && (
        <Card className="space-y-3 ring-2 ring-sky-200">
          <h3 className="text-sm font-semibold text-slate-900">Réserver cette chambre</h3>
          <div>
            <Label>Date d'arrivée du locataire</Label>
            <Input
              type="date"
              min={todayIso}
              value={reserveDate}
              onChange={(e) => setReserveDate(e.target.value)}
            />
          </div>
          <div>
            <Label>Nom du futur locataire (optionnel)</Label>
            <Input
              value={reserveName}
              onChange={(e) => setReserveName(e.target.value)}
              placeholder="ex. Jean Dupont"
            />
          </div>
          <div>
            <Label>Acompte versé à la réservation (optionnel, en FCFA)</Label>
            <Input
              inputMode="numeric"
              value={reserveDeposit}
              onChange={(e) => setReserveDeposit(e.target.value.replace(/\D/g, ''))}
              placeholder="0"
            />
            <p className="mt-1 text-xs text-slate-400">
              Déduit automatiquement du paiement d'ouverture quand l'arrivée est confirmée.
            </p>
          </div>
          {reserveError && (
            <p className="rounded bg-red-50 p-2 text-xs text-red-700 ring-1 ring-inset ring-red-200">
              {reserveError}
            </p>
          )}
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => {
                setReserving(false);
                setReserveError(null);
              }}
            >
              Annuler
            </Button>
            <Button
              variant="info"
              className="flex-1"
              busy={reserveBusy}
              disabled={!reserveDate}
              onClick={() => void reserve()}
            >
              Confirmer la réservation
            </Button>
          </div>
          <p className="text-xs text-slate-500">
            La chambre passera en bleu jusqu'au jour d'arrivée, puis se libérera
            automatiquement. Vous pourrez alors créer l'occupation réelle pour la passer
            en vert.
          </p>
        </Card>
      )}

      {saved && (
        <p className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
          <CheckIcon className="h-4 w-4" />
          {t('templates.saved')}
        </p>
      )}

      {/* Barre d'actions principales ─ Enregistrer (vert) + Réserver (bleu) */}
      <div className="flex gap-2">
        <Button variant="success" className="flex-1" onClick={() => void save()}>
          {t('common.save')}
        </Button>
        {unit.manualStatus !== 'RESERVED' && !unit.activeOccupancyId && (
          <Button
            variant="info"
            className="flex-1"
            onClick={() => {
              setReserving(true);
              setReserveError(null);
            }}
          >
            Réserver
          </Button>
        )}
      </div>
    </div>
  );
}
