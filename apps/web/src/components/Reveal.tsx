import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Composant « révéler au scroll » — passe l'enfant d'opacity-0/translate-y
 * vers opacity-100/translate-y-0 quand il entre dans la zone de visibilité,
 * via IntersectionObserver (une seule fois : pas de re-trigger au scroll up).
 *
 * `delay` ajoute un échelonnement subtil dans une grille de cartes
 * (incrémenter de 60–100 ms par item), `as` permet de choisir la balise HTML.
 * Rien ne se passe si l'utilisateur a configuré prefers-reduced-motion.
 */
export function Reveal({
  children,
  delay = 0,
  as: Tag = 'div',
  className = '',
}: {
  children: ReactNode;
  delay?: number;
  as?: 'div' | 'section' | 'li' | 'article' | 'header';
  className?: string;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    try {
      setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch {
      /* support partiel : ignoré */
    }
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduced) {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setVisible(true);
            io.disconnect();
            break;
          }
        }
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.1 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduced]);

  const style = { transitionDelay: visible ? `${delay}ms` : '0ms' };
  const cls = `transition-all duration-700 ease-out ${
    visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
  } ${className}`;

  // Les composants reçus par noms doivent passer un ref — on utilise la balise directement.
  const Element = Tag as 'div';
  return (
    <Element ref={ref as React.RefObject<HTMLDivElement>} className={cls} style={style}>
      {children}
    </Element>
  );
}
