import { formatFcfa } from '@citegest/shared';

export { formatFcfa };

/** Date JJ/MM/AAAA (fuseau Africa/Douala — UTC+1 sans heure d'été). */
export function formatDate(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Africa/Douala',
  }).format(d);
}

/** Couleur Tailwind associée à l'état d'une unité (RG18). */
export const UNIT_COLOR_CLASS: Record<string, string> = {
  GREEN: 'bg-emerald-500',
  ORANGE: 'bg-amber-500',
  RED: 'bg-red-500',
  GREY: 'bg-slate-300',
  BLUE: 'bg-sky-500',
};
