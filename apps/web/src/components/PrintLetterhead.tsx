import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../lib/auth';
import { BuildingIcon } from './icons';

/**
 * En-tête et pied de document, visibles uniquement à l'impression.
 * Posé une fois dans le cadre de l'app : n'importe quel écran imprimé sort
 * comme un document administratif (bailleur, date d'édition, mention Bailo).
 */
export function PrintLetterhead() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [stamp, setStamp] = useState(() => new Date());

  // La date d'édition est figée au moment où l'on imprime, pas au chargement.
  useEffect(() => {
    const onBefore = () => setStamp(new Date());
    window.addEventListener('beforeprint', onBefore);
    return () => window.removeEventListener('beforeprint', onBefore);
  }, []);

  const locale = i18n.language === 'en' ? 'en-GB' : 'fr-FR';
  const date = stamp.toLocaleDateString(locale, { day: '2-digit', month: 'long', year: 'numeric' });
  const time = stamp.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });

  return (
    <>
      <div className="mb-6 hidden items-end justify-between border-b-2 border-slate-900 pb-3 print:flex">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand text-white">
            <BuildingIcon className="h-5 w-5" />
          </span>
          <div className="leading-tight">
            <div className="text-base font-bold text-slate-900">{user?.accountName ?? t('app.title')}</div>
            <div className="text-xs text-slate-500">{t('nav.tagline')}</div>
          </div>
        </div>
        <div className="text-right text-xs leading-relaxed text-slate-600">
          <div>{t('print.editedOn', { date, time })}</div>
          <div className="text-slate-400">{t('print.generatedBy')}</div>
        </div>
      </div>
    </>
  );
}

/** Ligne d'information visible seulement sur papier (ex. filtres appliqués). */
export function PrintNote({ children }: { children: ReactNode }) {
  return <p className="hidden text-xs text-slate-600 print:block">{children}</p>;
}
