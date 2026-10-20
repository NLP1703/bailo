import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { XIcon } from './icons';

/**
 * Bandeau RGPD minimaliste.
 *
 * Bailo n'utilise que des cookies TECHNIQUES (session d'authentification),
 * aucun traceur tiers, aucune pub, aucune analyse comportementale. Le bandeau
 * est donc informatif, sans « accepter / refuser » : les cookies techniques
 * sont nécessaires au fonctionnement du service (base légale : intérêt
 * légitime / exécution du contrat). Un simple bouton « J'ai compris » suffit
 * et la préférence est mémorisée.
 */
const KEY = 'bailo.cookies.ack';

export function CookieBanner() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(KEY)) {
        // Léger délai pour ne pas afficher le bandeau pendant le premier paint.
        const id = setTimeout(() => setVisible(true), 600);
        return () => clearTimeout(id);
      }
    } catch {
      /* localStorage indisponible : on affiche le bandeau à chaque visite */
      setVisible(true);
    }
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(KEY, new Date().toISOString());
    } catch {
      /* silencieux */
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-labelledby="cookie-banner-title"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-4 pb-safe pt-3 shadow-[0_-4px_18px_-10px_rgba(15,23,42,0.18)] backdrop-blur dark:border-slate-700 dark:bg-slate-900/95 lg:px-6 print:hidden"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 12px)' }}
    >
      <div className="mx-auto flex max-w-5xl items-start gap-3">
        <div className="min-w-0 flex-1 text-sm text-slate-700 dark:text-slate-200">
          <p id="cookie-banner-title" className="font-semibold text-slate-900 dark:text-slate-100">
            {t('cookies.title')}
          </p>
          <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">{t('cookies.body')}</p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-dark"
        >
          {t('cookies.ack')}
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label={t('common.close')}
          className="shrink-0 rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          <XIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
