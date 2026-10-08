import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  REMINDER_STAGES,
  TEMPLATE_KINDS,
  type ReminderStage,
  type TemplateKind,
} from '@citegest/shared';
import { api } from '../lib/api';

interface Template {
  id: string;
  kind: TemplateKind;
  name: string;
  locale: string;
  stage: ReminderStage | null;
  bodyHtml: string;
  isDefault: boolean;
}

const keyOf = (kind: string, locale: string, stage: string | null): string =>
  `${kind}|${locale}|${stage ?? ''}`;

/** Édition des modèles de messages de relance, de contrat et de reçu (F7.2). OWNER. */
export function Templates() {
  const { t } = useTranslation();
  const [all, setAll] = useState<Template[]>([]);
  const [kind, setKind] = useState<TemplateKind>('REMINDER');
  const [locale, setLocale] = useState('fr');
  const [stage, setStage] = useState<ReminderStage>('J_MINUS_3');
  const [body, setBody] = useState('');
  const [saved, setSaved] = useState(false);

  const load = () =>
    api
      .get<Template[]>('/templates')
      .then(setAll)
      .catch(() => setAll([]));
  useEffect(() => {
    void load();
  }, []);

  const stageOrNull = (): ReminderStage | null => (kind === 'REMINDER' ? stage : null);

  const current = useMemo(
    () => all.find((x) => keyOf(x.kind, x.locale, x.stage) === keyOf(kind, locale, stageOrNull())),
    [all, kind, locale, stage],
  );

  useEffect(() => {
    setBody(current?.bodyHtml ?? '');
    setSaved(false);
  }, [current]);

  const save = async () => {
    if (body.trim().length === 0) return;
    await api.put('/templates', {
      id: current?.id,
      kind,
      name: current?.name ?? `${kind}-${locale}${kind === 'REMINDER' ? `-${stage}` : ''}`,
      locale,
      stage: stageOrNull() ?? undefined,
      bodyHtml: body,
      isDefault: true,
    });
    setSaved(true);
    await load();
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{t('templates.title')}</h1>
      <p className="text-sm text-slate-600">
        {t('templates.variables')} : {'{nom} {chambre} {montant} {date}'}
      </p>

      <div className="flex flex-wrap gap-2">
        <select
          className="rounded border border-slate-300 px-2 py-2 text-sm"
          value={kind}
          onChange={(e) => setKind(e.target.value as TemplateKind)}
        >
          {TEMPLATE_KINDS.map((k) => (
            <option key={k} value={k}>
              {t(`templates.kind.${k}`)}
            </option>
          ))}
        </select>
        <select
          className="rounded border border-slate-300 px-2 py-2 text-sm"
          value={locale}
          onChange={(e) => setLocale(e.target.value)}
        >
          <option value="fr">FR</option>
          <option value="en">EN</option>
        </select>
        {kind === 'REMINDER' && (
          <select
            className="rounded border border-slate-300 px-2 py-2 text-sm"
            value={stage}
            onChange={(e) => setStage(e.target.value as ReminderStage)}
          >
            {REMINDER_STAGES.map((s) => (
              <option key={s} value={s}>
                {t(`templates.stage.${s}`)}
              </option>
            ))}
          </select>
        )}
      </div>

      <textarea
        className="h-48 w-full rounded border border-slate-300 p-3 font-mono text-sm"
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
          setSaved(false);
        }}
        placeholder={t('templates.placeholder')}
      />

      {saved && (
        <p className="rounded bg-emerald-50 p-2 text-sm text-emerald-700">{t('templates.saved')}</p>
      )}

      <button
        onClick={save}
        disabled={body.trim().length === 0}
        className="w-full rounded bg-brand py-2 font-semibold text-white disabled:opacity-50"
      >
        {t('common.save')}
      </button>
    </div>
  );
}
