import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckIcon, CopyIcon } from './icons';

/**
 * Bouton générique « Copier ». Appui court → copie dans le presse-papiers,
 * micro-feedback visuel (icône check + libellé « Copié ») pendant 1,5 s.
 * Utilisable pour numéros de reçu, téléphones, tokens d'invitation, etc.
 */
export function CopyButton({
  value,
  label,
  className = '',
}: {
  value: string;
  /** Libellé optionnel à afficher à côté de l'icône (sinon icône seule). */
  label?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API indisponible (HTTP, vieux navigateurs) : fallback silencieux.
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-label={copied ? t('copy.done') : t('copy.aria', { value })}
      title={copied ? t('copy.done') : t('copy.title')}
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold transition active:scale-95 ${
        copied
          ? 'bg-emerald-100 text-emerald-700'
          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600'
      } ${className}`}
    >
      {copied ? <CheckIcon className="h-3.5 w-3.5" /> : <CopyIcon className="h-3.5 w-3.5" />}
      {label && <span>{copied ? t('copy.done') : label}</span>}
    </button>
  );
}
