import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  REMINDER_STAGES,
  TEMPLATE_KINDS,
  TEMPLATE_VARIABLES,
  type AdminTemplateView,
  type UpsertTemplateDto,
} from '@bailo/shared';
import { api } from '../../../lib/api';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorText,
  Input,
  Label,
  NativeSelect,
  TextArea,
} from '../../../components/ui';

/**
 * Modèles de messages — relances, contrats, reçus — avec un éditeur modal et
 * un aperçu rendu via `/admin/account/preview-template`.
 *
 * Variables disponibles : {nom} {chambre} {montant} {date} {site}
 * — pour les ignorer dans l'aperçu, laisser le champ vide et un placeholder
 * est utilisé à la place.
 */
export function TemplatesSection() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<AdminTemplateView[] | null>(null);
  const [editing, setEditing] = useState<Partial<AdminTemplateView> | null>(null);

  async function reload() {
    const list = await api.get<AdminTemplateView[]>('/templates');
    setRows(list);
  }
  useEffect(() => {
    reload().catch(() => setRows([]));
  }, []);

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            {t('admin.settings.templates.title')}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {t('admin.settings.templates.subtitle')}
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            setEditing({
              kind: 'REMINDER',
              locale: 'fr',
              stage: null,
              name: '',
              bodyHtml: '',
              isDefault: false,
            })
          }
        >
          + {t('admin.settings.templates.add')}
        </Button>
      </div>

      <div className="mt-5">
        {rows === null ? (
          <p className="text-sm text-slate-400">…</p>
        ) : rows.length === 0 ? (
          <EmptyState
            title={t('admin.settings.templates.empty')}
            message={t('admin.settings.templates.emptyHint')}
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-medium text-slate-900">{r.name}</p>
                    <Badge tone="slate">{t(`admin.settings.templates.kind_${r.kind}`)}</Badge>
                    <Badge tone="slate">{r.locale.toUpperCase()}</Badge>
                    {r.stage && (
                      <Badge tone="amber">
                        {t(`reminders.stage_${r.stage}`, { defaultValue: r.stage })}
                      </Badge>
                    )}
                    {r.isDefault && (
                      <Badge tone="emerald">{t('admin.settings.templates.default')}</Badge>
                    )}
                  </div>
                  <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{r.bodyHtml}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setEditing(r)}>
                  {t('common.edit')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {editing && (
        <TemplateEditor
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
    </Card>
  );
}

// ─── Éditeur modal avec aperçu ──────────────────────────────────────────────

function TemplateEditor({
  initial,
  onClose,
  onSaved,
}: {
  initial: Partial<AdminTemplateView>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<Partial<AdminTemplateView>>(initial);
  const [preview, setPreview] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!form.bodyHtml) {
      setPreview('');
      return;
    }
    const vars: Record<string, string> = {
      nom: 'Marie',
      chambre: 'A12',
      montant: '45 000 FCFA',
      date: '15/10',
      site: 'Cité Campus',
    };
    api
      .patch<{ preview: string }>('/admin/account/preview-template', {
        bodyHtml: form.bodyHtml,
        vars,
      })
      .then((r) => setPreview(r.preview))
      .catch(() => setPreview(''));
  }, [form.bodyHtml]);

  function set<K extends keyof AdminTemplateView>(k: K, v: AdminTemplateView[K] | null) {
    setForm((f) => ({ ...f, [k]: v as never }));
  }

  async function save() {
    setError(null);
    if (!form.name || !form.bodyHtml || !form.kind || !form.locale) {
      setError(t('admin.settings.templates.err.required'));
      return;
    }
    setSaving(true);
    try {
      const dto: UpsertTemplateDto = {
        id: form.id,
        kind: form.kind,
        name: form.name,
        locale: form.locale as 'fr' | 'en',
        stage: form.stage ?? undefined,
        bodyHtml: form.bodyHtml,
        isDefault: form.isDefault ?? false,
      };
      await api.put('/templates', dto);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('admin.settings.err.generic'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-slate-900/50 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-slate-900">
          {form.id
            ? t('admin.settings.templates.edit')
            : t('admin.settings.templates.new')}
        </h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>{t('admin.settings.templates.name')}</Label>
            <Input value={form.name ?? ''} onChange={(e) => set('name', e.target.value)} />
          </div>
          <div>
            <Label>{t('admin.settings.templates.kind')}</Label>
            <NativeSelect
              value={form.kind ?? 'REMINDER'}
              onChange={(e) =>
                set('kind', e.target.value as AdminTemplateView['kind'])
              }
            >
              {TEMPLATE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`admin.settings.templates.kind_${k}`)}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div>
            <Label>{t('admin.settings.templates.locale')}</Label>
            <NativeSelect
              value={form.locale ?? 'fr'}
              onChange={(e) => set('locale', e.target.value as 'fr' | 'en')}
            >
              <option value="fr">Français</option>
              <option value="en">English</option>
            </NativeSelect>
          </div>
          {form.kind === 'REMINDER' && (
            <div className="sm:col-span-2">
              <Label>{t('admin.settings.templates.stage')}</Label>
              <NativeSelect
                value={form.stage ?? ''}
                onChange={(e) =>
                  set(
                    'stage',
                    (e.target.value || null) as AdminTemplateView['stage'],
                  )
                }
              >
                <option value="">—</option>
                {REMINDER_STAGES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </NativeSelect>
            </div>
          )}
          <div className="sm:col-span-2">
            <Label>{t('admin.settings.templates.body')}</Label>
            <TextArea
              rows={5}
              value={form.bodyHtml ?? ''}
              onChange={(e) => set('bodyHtml', e.target.value)}
              placeholder="Bonjour {nom}, loyer de {chambre} ({montant}) dû le {date}."
            />
            <p className="mt-1 text-[11px] text-slate-500">
              {t('admin.settings.templates.vars')} :{' '}
              <span className="font-mono">
                {TEMPLATE_VARIABLES.map((v) => `{${v}}`).join('  ')}
              </span>
            </p>
          </div>
          <label className="flex items-center gap-2 sm:col-span-2">
            <input
              type="checkbox"
              checked={form.isDefault ?? false}
              onChange={(e) => set('isDefault', e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
            />
            <span className="text-sm text-slate-700">
              {t('admin.settings.templates.setDefault')}
            </span>
          </label>
          <div className="sm:col-span-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              {t('admin.settings.templates.preview')}
            </p>
            <div className="mt-2 min-h-[64px] whitespace-pre-wrap rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-sm text-slate-700">
              {preview || <span className="text-slate-400">—</span>}
            </div>
          </div>
        </div>
        {error && (
          <div className="mt-4">
            <ErrorText message={error} />
          </div>
        )}
        <div className="mt-5 flex items-center justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={save} busy={saving}>
            {t('common.save')}
          </Button>
        </div>
      </div>
    </div>
  );
}
