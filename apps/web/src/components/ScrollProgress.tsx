import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowUpIcon } from './icons';

/**
 * Deux comportements liés au scroll de la page :
 *
 *  - Barre de progression fixée en haut (0..100 %) — purement visuelle,
 *    cachée en-dessous du seuil de 2 % pour ne pas apparaître sur une
 *    page qui ne scrolle pas. Masquée à l'impression.
 *  - Bouton flottant « Retour en haut », visible après ~500 px de scroll
 *    descendant, discret, remonte en douceur. Positionné à gauche du FAB
 *    de contact et au-dessus de la bottom-nav.
 */
export function ScrollProgress() {
  const { t } = useTranslation();
  const [pct, setPct] = useState(0);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const update = () => {
      const h = document.documentElement;
      const scrolled = h.scrollTop;
      const total = h.scrollHeight - h.clientHeight;
      setPct(total > 0 ? Math.min(100, Math.max(0, (scrolled / total) * 100)) : 0);
      setShow(scrolled > 500);
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  return (
    <>
      <div
        role="progressbar"
        aria-label={t('a11y.scrollProgress')}
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        className={`fixed inset-x-0 top-0 z-[55] h-0.5 origin-left bg-brand transition-opacity duration-200 print:hidden ${pct < 2 ? 'opacity-0' : 'opacity-100'}`}
        style={{ transform: `scaleX(${pct / 100})` }}
      />
      <button
        type="button"
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        aria-label={t('a11y.backToTop')}
        className={`fixed right-4 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-slate-900/80 text-white shadow-lg backdrop-blur transition-all hover:bg-slate-900 lg:hidden print:hidden ${show ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0 pointer-events-none'}`}
        style={{ bottom: 'calc(var(--bottom-nav-h) + var(--safe-bottom) + 80px)' }}
      >
        <ArrowUpIcon className="h-5 w-5" />
      </button>
      {/* Variante desktop (coin bas-droite classique). */}
      <button
        type="button"
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        aria-label={t('a11y.backToTop')}
        className={`fixed bottom-6 right-6 z-20 hidden h-11 w-11 items-center justify-center rounded-full bg-slate-900/80 text-white shadow-lg backdrop-blur transition-all hover:bg-slate-900 lg:flex print:hidden ${show ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0 pointer-events-none'}`}
      >
        <ArrowUpIcon className="h-5 w-5" />
      </button>
    </>
  );
}
