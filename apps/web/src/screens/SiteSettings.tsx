import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { PageHeader, Card, Input, NativeSelect, Button, Label, PageSkeleton } from '../components/ui';
import { CheckIcon } from '../components/icons';

interface Site {
  id: string;
  name: string;
  type: string;
  city: string | null;
  district: string | null;
  landmark: string | null;
  graceDays: number;
  prorataMode: 'FULL' | 'PRORATA';
  reminderJm3: boolean;
  reminderJ0: boolean;
  reminderJp5: boolean;
  reminderJp15: boolean;
  penaltyEnabled: boolean;
  penaltyMode: 'FIXED' | 'PERCENT';
  penaltyValue: number;
  penaltyGraceDays: number;
}

export function SiteSettings() {
  const { t } = useTranslation();
  const { id } = useParams();
  const [site, setSite] = useState<Site | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get<Site[]>('/sites')
      .then((all) => setSite(all.find((s) => s.id === id) ?? null))
      .catch(() => setSite(null));
  }, [id]);

  if (!site) return <PageSkeleton />;

  const set = <K extends keyof Site>(key: K, value: Site[K]) => {
    setSite({ ...site, [key]: value });
    setSaved(false);
  };

  const save = async () => {
    setBusy(true);
    try {
      await api.patch(`/sites/${site.id}`, {
        name: site.name,
        city: site.city || undefined,
        district: site.district || undefined,
        landmark: site.landmark || undefined,
        graceDays: site.graceDays,
        prorataMode: site.prorataMode,
        reminderJm3: site.reminderJm3,
        reminderJ0: site.reminderJ0,
        reminderJp5: site.reminderJp5,
        reminderJp15: site.reminderJp15,
        penaltyEnabled: site.penaltyEnabled,
        penaltyMode: site.penaltyMode,
        penaltyValue: site.penaltyValue,
        penaltyGraceDays: site.penaltyGraceDays,
      });
      setSaved(true);
    } finally {
      setBusy(false);
    }
  };

  const Check = ({ k, label }: { k: keyof Site; label: string }) => (
    <label className="flex items-center gap-2 text-sm text-slate-700">
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand/30"
        checked={site[k] as boolean}
        onChange={(e) => set(k, e.target.checked as Site[typeof k])}
      />
      {label}
    </label>
  );

  return (
    <div className="space-y-4">
      <PageHeader title={`${t('site.title')} · ${site.name}`} />

      <Card className="space-y-3">
        <div>
          <Label>{t('settings.siteName')}</Label>
          <Input value={site.name} onChange={(e) => set('name', e.target.value)} />
        </div>
        <div className="flex gap-2">
          <Input
            placeholder={t('site.city')}
            value={site.city ?? ''}
            onChange={(e) => set('city', e.target.value)}
          />
          <Input
            placeholder={t('site.district')}
            value={site.district ?? ''}
            onChange={(e) => set('district', e.target.value)}
          />
        </div>
        <Input
          placeholder={t('site.landmark')}
          value={site.landmark ?? ''}
          onChange={(e) => set('landmark', e.target.value)}
        />
        <div className="flex gap-2">
          <div className="w-28">
            <Label>{t('site.graceDays')}</Label>
            <Input
              inputMode="numeric"
              value={site.graceDays}
              onChange={(e) => set('graceDays', Number(e.target.value.replace(/\D/g, '')) || 0)}
            />
          </div>
          <div className="flex-1">
            <Label>{t('site.prorataMode')}</Label>
            <NativeSelect
              value={site.prorataMode}
              onChange={(e) => set('prorataMode', e.target.value as Site['prorataMode'])}
            >
              <option value="FULL">{t('site.prorataFull')}</option>
              <option value="PRORATA">{t('site.prorataProrata')}</option>
            </NativeSelect>
          </div>
        </div>
      </Card>

      <Card className="space-y-2">
        <Label>{t('site.reminders')}</Label>
        <Check k="reminderJm3" label={t('templates.stage.J_MINUS_3')} />
        <Check k="reminderJ0" label={t('templates.stage.J_0')} />
        <Check k="reminderJp5" label={t('templates.stage.J_PLUS_5')} />
        <Check k="reminderJp15" label={t('templates.stage.J_PLUS_15')} />
      </Card>

      <Card className="space-y-3">
        <Check k="penaltyEnabled" label={t('site.penaltyEnabled')} />
        {site.penaltyEnabled && (
          <>
            <div className="flex gap-2">
              <div className="flex-1">
                <Label>{t('site.penaltyMode')}</Label>
                <NativeSelect
                  value={site.penaltyMode}
                  onChange={(e) => set('penaltyMode', e.target.value as Site['penaltyMode'])}
                >
                  <option value="FIXED">{t('site.penaltyFixed')}</option>
                  <option value="PERCENT">{t('site.penaltyPercent')}</option>
                </NativeSelect>
              </div>
              <div className="w-28">
                <Label>{t('site.penaltyValue')}</Label>
                <Input
                  inputMode="numeric"
                  value={site.penaltyValue}
                  onChange={(e) =>
                    set('penaltyValue', Number(e.target.value.replace(/\D/g, '')) || 0)
                  }
                />
              </div>
            </div>
            <div className="w-40">
              <Label>{t('site.penaltyGraceDays')}</Label>
              <Input
                inputMode="numeric"
                value={site.penaltyGraceDays}
                onChange={(e) =>
                  set('penaltyGraceDays', Number(e.target.value.replace(/\D/g, '')) || 0)
                }
              />
            </div>
          </>
        )}
      </Card>

      {saved && (
        <p className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
          <CheckIcon className="h-4 w-4" />
          {t('settings.profileSaved')}
        </p>
      )}
      <Button block busy={busy} onClick={save}>
        {t('common.save')}
      </Button>
    </div>
  );
}
