import { useTranslation } from 'react-i18next';
import { formatReceiptNumber } from '@bailo/shared';

/**
 * Aperçu léger d'un reçu : préfixe + numéro séquentiel RG9 + pied de page.
 * Rendu statique (pas d'appel API) : montre à l'OWNER à quoi ressemblera le
 * prochain reçu avec les réglages en cours. Les reçus déjà émis ne sont pas
 * modifiés par un changement de préfixe (la numérotation `ReceiptSequence`
 * en base reste intacte — cf. test e2e Lot 4).
 */
export function ReceiptPreview({
  prefix,
  footer,
}: {
  prefix: string;
  footer: string | null;
}) {
  const { t } = useTranslation();
  const year = new Date().getFullYear();
  const sample = formatReceiptNumber(prefix || 'BL', year, 142);
  return (
    <div className="mt-5 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        {t('admin.settings.identity.preview')}
      </p>
      <div className="mt-2 flex items-baseline justify-between">
        <span className="font-mono text-sm font-semibold text-slate-800">{sample}</span>
        <span className="text-[11px] text-slate-500">
          {t('admin.settings.identity.previewHint')}
        </span>
      </div>
      {footer && (
        <p className="mt-3 border-t border-slate-200 pt-2 text-center text-[11px] italic text-slate-500">
          {footer}
        </p>
      )}
    </div>
  );
}
