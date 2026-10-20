import { useTranslation } from 'react-i18next';

/**
 * Lien « Aller au contenu » invisible jusqu'au focus clavier (Tab).
 * Permet aux utilisateurs de lecteurs d'écran et de navigation clavier
 * de sauter la barre latérale et la top-bar pour atteindre directement
 * la zone de contenu. Convention WCAG 2.1 (2.4.1 — Bypass Blocks).
 */
export function SkipLink({ targetId = 'main-content' }: { targetId?: string }) {
  const { t } = useTranslation();
  return (
    <a
      href={`#${targetId}`}
      className="fixed left-3 top-3 z-[70] -translate-y-20 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white shadow-pop transition-transform focus:translate-y-0 focus:outline-none focus:ring-2 focus:ring-white"
    >
      {t('a11y.skipToContent')}
    </a>
  );
}
