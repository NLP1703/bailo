import { useEffect } from 'react';

/**
 * Titre et description de la page courante (onglet du navigateur, résultats Google).
 * Les valeurs précédentes sont restaurées en quittant la page.
 */
export function usePageMeta(title: string, description?: string): void {
  useEffect(() => {
    const previousTitle = document.title;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const previousDescription = meta?.content;
    document.title = title;
    if (meta && description) meta.content = description;
    return () => {
      document.title = previousTitle;
      if (meta && previousDescription !== undefined) meta.content = previousDescription;
    };
  }, [title, description]);
}
