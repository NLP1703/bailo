import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CURRENCIES,
  PENALTY_MODES,
  PRORATA_MODES,
  RECEIPT_PREFIX_RE,
  type AdminAccountView,
  type UpdateAdminAccountDto,
} from '@bailo/shared';
import { api } from '../../lib/api';
import {
  Button,
  Card,
  ErrorText,
  Input,
  Label,
  NativeSelect,
  PageSkeleton,
  TextArea,
} from '../../components/ui';
import { TemplatesSection } from './admin-settings/TemplatesSection';
import { ReceiptPreview } from './admin-settings/ReceiptPreview';

/**
 * Onglet Administration → Paramètres (Lot 4, OWNER uniquement).
 *
 * Trois formulaires indépendants :
 *  1. Identité et reçus (nom, téléphone, préfixe, pied, URL de vérification,
 *     devise d'affichage, mode diaspora).
 *  2. Règles par défaut (pénalité et prorata) appliquées aux nouveaux sites.
 *  3. Modèles de messages (liste, édition, aperçu).
 *
 * Chaque formulaire a son propre bouton « Enregistrer » et affiche son erreur
 * de validation (prefixe hors format, URL non HTTPS en prod, etc.) sans
 * bloquer les autres sections.
 */
export function AdminSettings() {
  const { t } = useTranslation();
  const [account, setAccount] = useState<AdminAccountView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<AdminAccountView>('/admin/account')
      .then(setAccount)
      .catch(() => setLoadError(t('admin.settings.loadError')));
  }, [t]);

  if (loadError) return <Card>{loadError}</Card>;
  if (!account) return <PageSkeleton variant="detail" />;

  return (
    <div className="space-y-5">
      <ProfileAndReceiptsSection account={account} onSaved={setAccount} />
      <DefaultsSection account={account} onSaved={setAccount} />
      <TemplatesSection />
    </div>
  );
}

// ─── Section 1 : identité, reçus, diaspora ───────────────────────────────────

function ProfileAndReceiptsSection({
  account,
  onSaved,
}: {
  account: AdminAccountView;
  onSaved: (a: AdminAccountView) => void;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<AdminAccountView>(account);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => setForm(account), [account]);
  function set<K extends keyof AdminAccountView>(k: K, v: AdminAccountView[K]) {
    setForm((f) => ({ ...f, [k]: v }));
    setSaved(false);
  }

  const prefixOk = RECEIPT_PREFIX_RE.test(form.receiptPrefix);

  async function save() {
    setError(null);
    if (!prefixOk) {
      setError(t('admin.settings.err.prefix'));
      return;
    }
    setSaving(true);
    try {
      const dto: UpdateAdminAccountDto = {
        name: form.name,
        phone: form.phone,
        receiptPrefix: form.receiptPrefix,
        receiptFooter: form.receiptFooter,
        displayCurrency: form.displayCurrency,
        diasporaMode: form.diasporaMode,
        verifyBaseUrl: form.verifyBaseUrl,
      };
      const next = await api.patch<AdminAccountView>('/admin/account', dto);
      onSaved(next);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('admin.settings.err.generic'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <h2 className="text-base font-semibold text-slate-900">
        {t('admin.settings.identity.title')}
      </h2>
      <p className="mt-1 text-sm text-slate-500">{t('admin.settings.identity.subtitle')}</p>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <Field label={t('admin.settings.identity.name')}>
          <Input value={form.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label={t('admin.settings.identity.phone')}>
          <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} />
        </Field>
        <Field label={t('admin.settings.identity.prefix')}>
          <Input
            value={form.receiptPrefix}
            onChange={(e) => set('receiptPrefix', e.target.value.toUpperCase())}
            maxLength={6}
            className={prefixOk ? undefined : 'ring-2 ring-red-300'}
          />
          <p className="mt-1 text-[11px] text-slate-500">
            {t('admin.settings.identity.prefixHint')}
          </p>
        </Field>
        <Field label={t('admin.settings.identity.currency')}>
          <NativeSelect
            value={form.displayCurrency}
            onChange={(e) =>
              set('displayCurrency', e.target.value as AdminAccountView['displayCurrency'])
            }
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label={t('admin.settings.identity.verifyUrl')} className="md:col-span-2">
          <Input
            value={form.verifyBaseUrl ?? ''}
            placeholder="https://bailo.app"
            onChange={(e) => set('verifyBaseUrl', e.target.value || null)}
          />
          <p className="mt-1 text-[11px] text-slate-500">
            {t('admin.settings.identity.verifyUrlHint')}
          </p>
        </Field>
        <Field label={t('admin.settings.identity.footer')} className="md:col-span-2">
          <TextArea
            value={form.receiptFooter ?? ''}
            onChange={(e) => set('receiptFooter', e.target.value || null)}
            rows={2}
            maxLength={280}
            placeholder={t('admin.settings.identity.footerPlaceholder')}
          />
        </Field>
        <label className="flex items-start gap-2.5 md:col-span-2">
          <input
            type="checkbox"
            checked={form.diasporaMode}
            onChange={(e) => set('diasporaMode', e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
          />
          <span className="text-sm">
            <span className="block font-medium text-slate-900">
              {t('admin.settings.identity.diaspora')}
            </span>
            <span className="block text-slate-500">
              {t('admin.settings.identity.diasporaHint')}
            </span>
          </span>
        </label>
      </div>

      <ReceiptPreview prefix={form.receiptPrefix} footer={form.receiptFooter} />

      {error && (
        <div className="mt-4">
          <ErrorText message={error} />
        </div>
      )}
      <div className="mt-5 flex items-center justify-end gap-3">
        {saved && <span className="text-sm text-emerald-600">{t('admin.settings.saved')}</span>}
        <Button onClick={save} busy={saving} disabled={!prefixOk}>
          {t('common.save')}
        </Button>
      </div>
    </Card>
  );
}

// ─── Section 2 : règles par défaut (pénalité + prorata) ──────────────────────

function DefaultsSection({
  account,
  onSaved,
}: {
  account: AdminAccountView;
  onSaved: (a: AdminAccountView) => void;
}) {
  const { t } = useTranslation();
  const [d, setD] = useState(account.defaults);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setD(account.defaults), [account.defaults]);

  function update<K extends keyof typeof d>(k: K, v: (typeof d)[K]) {
    setD((prev) => ({ ...prev, [k]: v }));
    setSaved(false);
  }

  async function save() {
    setError(null);
    setSaving(true);
    try {
      const next = await api.patch<AdminAccountView>('/admin/account', { defaults: d });
      onSaved(next);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('admin.settings.err.generic'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <h2 className="text-base font-semibold text-slate-900">
        {t('admin.settings.defaults.title')}
      </h2>
      <p className="mt-1 text-sm text-slate-500">{t('admin.settings.defaults.subtitle')}</p>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="flex items-start gap-2.5 md:col-span-2">
          <input
            type="checkbox"
            checked={d.penaltyEnabled}
            onChange={(e) => update('penaltyEnabled', e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
          />
          <span className="text-sm">
            <span className="block font-medium text-slate-900">
              {t('admin.settings.defaults.penaltyEnabled')}
            </span>
            <span className="block text-slate-500">
              {t('admin.settings.defaults.penaltyEnabledHint')}
            </span>
          </span>
        </label>
        <Field label={t('admin.settings.defaults.penaltyMode')}>
          <NativeSelect
            value={d.penaltyMode}
            onChange={(e) => update('penaltyMode', e.target.value as typeof d.penaltyMode)}
            disabled={!d.penaltyEnabled}
          >
            {PENALTY_MODES.map((m) => (
              <option key={m} value={m}>
                {t(`admin.settings.defaults.penaltyMode_${m}`)}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label={t(`admin.settings.defaults.penaltyValue_${d.penaltyMode}`)}>
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            value={d.penaltyValue}
            onChange={(e) => update('penaltyValue', Number(e.target.value) || 0)}
            disabled={!d.penaltyEnabled}
          />
        </Field>
        <Field label={t('admin.settings.defaults.graceDays')}>
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            max={60}
            value={d.penaltyGraceDays}
            onChange={(e) => update('penaltyGraceDays', Number(e.target.value) || 0)}
            disabled={!d.penaltyEnabled}
          />
        </Field>
        <Field label={t('admin.settings.defaults.prorata')}>
          <NativeSelect
            value={d.prorataMode}
            onChange={(e) => update('prorataMode', e.target.value as typeof d.prorataMode)}
          >
            {PRORATA_MODES.map((m) => (
              <option key={m} value={m}>
                {t(`admin.settings.defaults.prorata_${m}`)}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      {error && (
        <div className="mt-4">
          <ErrorText message={error} />
        </div>
      )}
      <div className="mt-5 flex items-center justify-end gap-3">
        {saved && <span className="text-sm text-emerald-600">{t('admin.settings.saved')}</span>}
        <Button onClick={save} busy={saving}>
          {t('common.save')}
        </Button>
      </div>
    </Card>
  );
}

// ─── Petit helper de formulaire ──────────────────────────────────────────────

function Field({
  label,
  className = '',
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  // id réservé pour un htmlFor futur ; Label est actuellement un simple <span>.
  useId();
  return (
    <div className={className}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}
