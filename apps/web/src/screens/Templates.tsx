import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  REMINDER_STAGES,
  TEMPLATE_KINDS,
  type ReminderStage,
  type TemplateKind,
} from '@bailo/shared';
import { api } from '../lib/api';
import { PageHeader, NativeSelect, TextArea, Button } from '../components/ui';

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
      <PageHeader title={t('templates.title')} />
      <p className="-mt-2 text-sm text-slate-500">
        {t('templates.variables')} :{' '}
        <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">
          {'{nom} {chambre} {montant} {date}'}
        </code>
      </p>

      <div className="flex flex-wrap gap-2">
        <NativeSelect
          className="!w-auto"
          value={kind}
          onChange={(e) => setKind(e.target.value as TemplateKind)}
        >
          {TEMPLATE_KINDS.map((k) => (
            <option key={k} value={k}>
              {t(`templates.kind.${k}`)}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect className="!w-auto" value={locale} onChange={(e) => setLocale(e.target.value)}>
          <option value="fr">FR</option>
          <option value="en">EN</option>
        </NativeSelect>
        {kind === 'REMINDER' && (
          <NativeSelect
            className="!w-auto"
            value={stage}
            onChange={(e) => setStage(e.target.value as ReminderStage)}
          >
            {REMINDER_STAGES.map((s) => (
              <option key={s} value={s}>
                {t(`templates.stage.${s}`)}
              </option>
            ))}
          </NativeSelect>
        )}
      </div>

      <TextArea
        className="h-48 font-mono"
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
          setSaved(false);
        }}
        placeholder={t('templates.placeholder')}
      />

      {saved && (
        <p className="rounded-lg bg-emerald-50 p-3 text-sm font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
          {t('templates.saved')}
        </p>
      )}

      <Button block onClick={save} disabled={body.trim().length === 0}>
        {t('common.save')}
      </Button>
    </div>
  );
}
