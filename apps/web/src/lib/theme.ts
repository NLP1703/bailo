import { useEffect, useState } from 'react';

/**
 * Thème clair / sombre / auto (préférence système).
 *
 * - `auto` lit `prefers-color-scheme` et change en direct si le système change.
 * - `light` et `dark` forcent explicitement, prioritaires sur la préférence système.
 * - La classe `dark` est appliquée sur `<html>` — toute la base Tailwind
 *   (`dark:bg-slate-900`, etc.) s'enclenche automatiquement.
 *
 * La préférence est persistée dans localStorage sous `bailo.theme` (une seule
 * clé, pas de cookie — pas de bannière RGPD pour ça).
 */
export type ThemeChoice = 'light' | 'dark' | 'auto';

const KEY = 'bailo.theme';

function systemPrefersDark(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  } catch {
    return false;
  }
}

function readChoice(): ThemeChoice {
  if (typeof window === 'undefined') return 'auto';
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

function apply(choice: ThemeChoice): void {
  if (typeof document === 'undefined') return;
  const dark = choice === 'dark' || (choice === 'auto' && systemPrefersDark());
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

/** Applique le thème le plus tôt possible (avant le premier render React). */
export function initTheme(): void {
  apply(readChoice());
}

/** Hook : expose la préférence courante et la fonction pour la changer. */
export function useTheme(): { theme: ThemeChoice; setTheme: (c: ThemeChoice) => void; isDark: boolean } {
  const [theme, setThemeState] = useState<ThemeChoice>(readChoice);
  const [isDark, setIsDark] = useState<boolean>(
    () => theme === 'dark' || (theme === 'auto' && systemPrefersDark()),
  );

  useEffect(() => {
    apply(theme);
    setIsDark(theme === 'dark' || (theme === 'auto' && systemPrefersDark()));
    // En mode auto, écoute les changements système.
    if (theme !== 'auto') return;
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const onChange = () => {
      apply('auto');
      setIsDark(systemPrefersDark());
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  const setTheme = (choice: ThemeChoice) => {
    try {
      if (choice === 'auto') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, choice);
    } catch {
      /* stockage indisponible : la préférence vaut pour la session */
    }
    setThemeState(choice);
  };

  return { theme, setTheme, isDark };
}
