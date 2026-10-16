import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SITE_TYPES, type SiteType } from '@bailo/shared';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Card, Input, NativeSelect, Button, Label, ErrorText, PageHeader } from '../components/ui';

/**
 * Création rapide d'une cité (ou immeuble/mixte) depuis la barre latérale.
 * Réservé aux propriétaires et gérants.
 * - On crée d'abord le site via POST /sites.
 * - Puis on crée les chambres (et les appartements si c'est un IMMEUBLE) via
 *   /sites/:id/units/bulk, pour que la cité soit utilisable dès la fin du formulaire.
 */
const DEFAULT_RENT = '25000';
const num = (s: string): number => Number(s.replace(/\D/g, '')) || 0;

export function AddSite() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [type, setType] = useState<SiteType>('CITE');
  const [city, setCity] = useState('');
  const [district, setDistrict] = useState('');
  const [furnished, setFurnished] = useState<'YES' | 'NO'>('NO');
  const [nbChambres, setNbChambres] = useState('');
  const [rentChambre, setRentChambre] = useState(DEFAULT_RENT);
  const [nbAppartements, setNbAppartements] = useState('');
  const [rentAppartement, setRentAppartement] = useState(DEFAULT_RENT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const canCreate =
    (user?.role === 'OWNER' || user?.role === 'MANAGER') && !user?.readOnly;

  const nChambres = num(nbChambres);
  const nAppartements = num(nbAppartements);
  const showAppartements = type === 'IMMEUBLE';
  const isFurnished = type === 'IMMEUBLE' && furnished === 'YES';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) {
      setError(t('addSite.nameTooShort'));
      return;
    }
    if (nChambres > 0 && num(rentChambre) <= 0) {
      setError(t('addSite.rentRequired'));
      return;
    }
    if (showAppartements && nAppartements > 0 && num(rentAppartement) <= 0) {
      setError(t('addSite.rentRequired'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const site = await api.post<{ id: string }>('/sites', {
        name: name.trim(),
        type,
        ...(city.trim() ? { city: city.trim() } : {}),
        ...(district.trim() ? { district: district.trim() } : {}),
        ...(type === 'IMMEUBLE' ? { defaultFurnished: isFurnished } : {}),
      });

      // Création des chambres (préfixe C, 1..N, loyer de base saisi).
      if (nChambres > 0) {
        await api.post(`/sites/${site.id}/units/bulk`, {
          prefix: 'C',
          from: 1,
          to: nChambres,
          padding: Math.max(2, String(nChambres).length),
          type: 'CHAMBRE',
          baseRent: num(rentChambre),
          furnished: isFurnished,
        });
      }

      // Création des appartements (préfixe A), uniquement pour un IMMEUBLE.
      if (showAppartements && nAppartements > 0) {
        await api.post(`/sites/${site.id}/units/bulk`, {
          prefix: 'A',
          from: 1,
          to: nAppartements,
          padding: Math.max(2, String(nAppartements).length),
          type: 'APPARTEMENT',
          baseRent: num(rentAppartement),
          furnished: isFurnished,
        });
      }

      navigate('/rooms', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('addSite.error'));
    } finally {
      setBusy(false);
    }
  };

  if (!canCreate) {
    return (
      <div className="space-y-4">
        <PageHeader title={t('addSite.title')} />
        <Card>
          <p className="text-sm text-slate-600">{t('addSite.forbidden')}</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <PageHeader title={t('addSite.title')} />
      <Card>
        <p className="mb-4 text-sm text-slate-500">{t('addSite.subtitle')}</p>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label>{t('addSite.name')}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('addSite.namePlaceholder')}
              autoFocus
              required
              minLength={2}
            />
          </div>
          <div>
            <Label>{t('addSite.type')}</Label>
            <NativeSelect value={type} onChange={(e) => setType(e.target.value as SiteType)}>
              {SITE_TYPES.map((s) => (
                <option key={s} value={s}>
                  {t(`addSite.types.${s}`)}
                </option>
              ))}
            </NativeSelect>
          </div>

          {type === 'IMMEUBLE' && (
            <div>
              <Label>{t('addSite.furnishedQuestion')}</Label>
              <NativeSelect
                value={furnished}
                onChange={(e) => setFurnished(e.target.value as 'YES' | 'NO')}
              >
                <option value="NO">{t('addSite.furnished.NO')}</option>
                <option value="YES">{t('addSite.furnished.YES')}</option>
              </NativeSelect>
              <p className="mt-1 text-xs text-slate-400">{t('addSite.furnishedHint')}</p>
            </div>
          )}

          {/* Nombre de chambres (toujours visible). */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label>{t('addSite.nbChambres')}</Label>
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                value={nbChambres}
                onChange={(e) => setNbChambres(e.target.value)}
                placeholder="0"
              />
            </div>
            {nChambres > 0 && (
              <div>
                <Label>{t('addSite.rentChambre')}</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={rentChambre}
                  onChange={(e) => setRentChambre(e.target.value)}
                  placeholder={DEFAULT_RENT}
                />
              </div>
            )}
          </div>

          {/* Nombre d'appartements (uniquement pour un IMMEUBLE). */}
          {showAppartements && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label>{t('addSite.nbAppartements')}</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={nbAppartements}
                  onChange={(e) => setNbAppartements(e.target.value)}
                  placeholder="0"
                />
              </div>
              {nAppartements > 0 && (
                <div>
                  <Label>{t('addSite.rentAppartement')}</Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={rentAppartement}
                    onChange={(e) => setRentAppartement(e.target.value)}
                    placeholder={DEFAULT_RENT}
                  />
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label>{t('addSite.city')}</Label>
              <Input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Yaoundé"
              />
            </div>
            <div>
              <Label>{t('addSite.district')}</Label>
              <Input
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
                placeholder="Melen"
              />
            </div>
          </div>

          {error && <ErrorText message={error} />}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => navigate(-1)}
              disabled={busy}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" busy={busy} block>
              {t('addSite.submit')}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
