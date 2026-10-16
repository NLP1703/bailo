import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { OnboardingUnitDto } from '@bailo/shared';
import { api, ApiError } from '../lib/api';
import { Card, Input, NativeSelect, Button, Label, ErrorText } from '../components/ui';
import { BuildingIcon } from '../components/icons';

interface TypeRow {
  key: 'CHAMBRE' | 'STUDIO' | 'APPARTEMENT' | 'MAISON';
  prefix: string;
  describable: boolean;
}
const TYPES: TypeRow[] = [
  { key: 'CHAMBRE', prefix: 'C', describable: false },
  { key: 'STUDIO', prefix: 'S', describable: false },
  { key: 'APPARTEMENT', prefix: 'A', describable: true },
  { key: 'MAISON', prefix: 'M', describable: true },
];

type Counts = Record<TypeRow['key'], { count: string; price: string }>;
const emptyCounts: Counts = {
  CHAMBRE: { count: '', price: '' },
  STUDIO: { count: '', price: '' },
  APPARTEMENT: { count: '', price: '' },
  MAISON: { count: '', price: '' },
};

interface HouseDesc {
  bedrooms: string;
  rooms: string;
}

/** Mise en service juste après l'inscription : création du bâtiment et de ses logements. */
export function Onboarding() {
  const { t } = useTranslation();
  const [step, setStep] = useState(1);

  const [name, setName] = useState('');
  const [type, setType] = useState('CITE');
  const [city, setCity] = useState('');
  const [district, setDistrict] = useState('');
  const [furnished, setFurnished] = useState(false);
  const [hasTenants, setHasTenants] = useState(false);

  const [counts, setCounts] = useState<Counts>(emptyCounts);
  // Descriptions par logement, indexées par type « décrivable » (maison, appartement).
  const [houses, setHouses] = useState<Record<string, HouseDesc[]>>({});

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const num = (v: string) => Number(v.replace(/\D/g, '')) || 0;
  const totalUnits = TYPES.reduce((s, ty) => s + num(counts[ty.key].count), 0);

  const setCount = (key: TypeRow['key'], count: string) => {
    setCounts((c) => ({ ...c, [key]: { ...c[key], count } }));
    const n = num(count);
    const row = TYPES.find((x) => x.key === key)!;
    if (row.describable) {
      setHouses((h) => {
        const cur = h[key] ?? [];
        const next = Array.from({ length: n }, (_, i) => cur[i] ?? { bedrooms: '', rooms: '' });
        return { ...h, [key]: next };
      });
    }
  };
  const setPrice = (key: TypeRow['key'], price: string) =>
    setCounts((c) => ({ ...c, [key]: { ...c[key], price } }));

  const setHouse = (key: string, i: number, patch: Partial<HouseDesc>) =>
    setHouses((h) => ({
      ...h,
      [key]: (h[key] ?? []).map((x, idx) => (idx === i ? { ...x, ...patch } : x)),
    }));

  const buildUnits = (): OnboardingUnitDto[] => {
    const units: OnboardingUnitDto[] = [];
    for (const ty of TYPES) {
      const n = num(counts[ty.key].count);
      const price = num(counts[ty.key].price);
      for (let i = 0; i < n; i += 1) {
        const desc = houses[ty.key]?.[i];
        units.push({
          type: ty.key,
          code: `${ty.prefix}${String(i + 1).padStart(2, '0')}`,
          baseRent: price,
          capacity: 1,
          bedrooms: desc && desc.bedrooms ? num(desc.bedrooms) : undefined,
          rooms: desc
            ? desc.rooms
                .split(',')
                .map((r) => r.trim())
                .filter(Boolean)
            : [],
        });
      }
    }
    return units;
  };

  const submit = async () => {
    setError('');
    if (totalUnits < 1) {
      setError(t('onboarding.needOne'));
      return;
    }
    setBusy(true);
    try {
      await api.post('/sites/onboarding', {
        site: {
          name,
          type,
          city: city.trim() || undefined,
          district: district.trim() || undefined,
        },
        furnished,
        units: buildUnits(),
        hasExistingTenants: hasTenants,
      });
      // On recharge : la « porte » d'onboarding voit alors un site et laisse entrer.
      window.location.href = hasTenants ? '/new-entry' : '/';
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('signup.error'));
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-slate-50 p-4">
      <header className="mb-4 mt-2 flex flex-col items-center text-center">
        <span className="mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/10 text-brand">
          <BuildingIcon className="h-6 w-6" />
        </span>
        <h1 className="text-xl font-bold text-slate-900">{t('onboarding.title')}</h1>
        <p className="text-sm text-slate-500">{t('onboarding.subtitle')}</p>
      </header>

      {step === 1 ? (
        <Card className="space-y-3">
          <Label>{t('onboarding.step1')}</Label>
          <Input
            placeholder={t('onboarding.buildingName')}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <div className="flex gap-2">
            <div className="flex-1">
              <Label>{t('onboarding.buildingType')}</Label>
              <NativeSelect value={type} onChange={(e) => setType(e.target.value)}>
                <option value="CITE">CITE</option>
                <option value="IMMEUBLE">IMMEUBLE</option>
                <option value="MIXTE">MIXTE</option>
              </NativeSelect>
            </div>
          </div>
          <div className="flex gap-2">
            <Input
              placeholder={t('onboarding.city')}
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />
            <Input
              placeholder={t('onboarding.district')}
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand/30"
              checked={furnished}
              onChange={(e) => setFurnished(e.target.checked)}
            />
            {t('onboarding.furnished')}
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand/30"
              checked={hasTenants}
              onChange={(e) => setHasTenants(e.target.checked)}
            />
            {t('onboarding.hasTenants')}
          </label>
          <Button block disabled={name.trim().length < 2} onClick={() => setStep(2)}>
            {t('onboarding.next')}
          </Button>
        </Card>
      ) : (
        <div className="space-y-4">
          <Card className="space-y-3">
            <Label>{t('onboarding.counts')}</Label>
            {TYPES.map((ty) => (
              <div key={ty.key} className="flex items-center gap-2">
                <span className="w-28 shrink-0 text-sm font-medium text-slate-700">
                  {t(`onboarding.${ty.key.toLowerCase()}`)}
                </span>
                <Input
                  className="w-16"
                  inputMode="numeric"
                  placeholder={t('onboarding.count')}
                  value={counts[ty.key].count}
                  onChange={(e) => setCount(ty.key, e.target.value.replace(/\D/g, ''))}
                />
                <Input
                  inputMode="numeric"
                  placeholder={t('onboarding.price')}
                  value={counts[ty.key].price}
                  onChange={(e) => setPrice(ty.key, e.target.value.replace(/\D/g, ''))}
                />
              </div>
            ))}
          </Card>

          {TYPES.filter((ty) => ty.describable && num(counts[ty.key].count) > 0).map((ty) => (
            <Card key={ty.key} className="space-y-3">
              <Label>
                {t('onboarding.describeHouses')} · {t(`onboarding.${ty.key.toLowerCase()}`)}
              </Label>
              {(houses[ty.key] ?? []).map((h, i) => (
                <div key={i} className="space-y-2 rounded-lg bg-slate-50 p-3">
                  <div className="text-sm font-semibold text-slate-700">
                    {ty.prefix}
                    {String(i + 1).padStart(2, '0')}
                  </div>
                  <div>
                    <Label>{t('onboarding.bedrooms')}</Label>
                    <Input
                      inputMode="numeric"
                      value={h.bedrooms}
                      onChange={(e) => setHouse(ty.key, i, { bedrooms: e.target.value.replace(/\D/g, '') })}
                    />
                  </div>
                  <div>
                    <Label>{t('onboarding.rooms')}</Label>
                    <Input
                      placeholder={t('onboarding.roomsHint')}
                      value={h.rooms}
                      onChange={(e) => setHouse(ty.key, i, { rooms: e.target.value })}
                    />
                  </div>
                </div>
              ))}
            </Card>
          ))}

          <ErrorText message={error} />
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setStep(1)}>
              {t('onboarding.back')}
            </Button>
            <Button className="flex-1" busy={busy} onClick={submit}>
              {t('onboarding.submit')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
