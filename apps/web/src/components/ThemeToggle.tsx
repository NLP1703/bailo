import { useTranslation } from 'react-i18next';
import { MoonIcon, SunIcon } from './icons';
import { useTheme, type ThemeChoice } from '../lib/theme';

/**
 * Toggle de thème à 3 valeurs : auto (système) · clair · sombre.
 * Compact, inline — pensé pour tenir dans le menu « Compte » (AccountMenu).
 */
export function ThemeToggle() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const options: { value: ThemeChoice; icon: typeof SunIcon; label: string }[] = [
    { value: 'light', icon: SunIcon, label: t('theme.light') },
    { value: 'auto', icon: SunIcon, label: t('theme.auto') },
    { value: 'dark', icon: MoonIcon, label: t('theme.dark') },
  ];
  return (
    <div
      role="radiogroup"
      aria-label={t('theme.label')}
      className="inline-flex rounded-lg bg-slate-100 p-0.5 dark:bg-slate-700"
    >
      {options.map((o) => {
        const Icon = o.icon;
        const active = theme === o.value;
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={active}
            onClick={() => setTheme(o.value)}
            title={o.label}
            className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold transition ${
              active
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            {o.value !== 'auto' && <Icon className="h-3.5 w-3.5" />}
            <span>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
