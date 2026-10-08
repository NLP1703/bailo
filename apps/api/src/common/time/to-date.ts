/** Convertit une chaîne ISO (date ou datetime) en Date ; défaut = maintenant. */
export function toDate(iso?: string): Date {
  if (!iso) return new Date();
  // Une date seule "2026-09-01" est interprétée à minuit UTC (échéances calendaires).
  const value = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00:00.000Z` : iso;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error(`Date invalide: ${iso}`);
  return d;
}
