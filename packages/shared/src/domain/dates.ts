// Helpers de dates « calendaires » (sans heure) pour les règles de gestion.
// On travaille en UTC à minuit pour éviter toute dérive de fuseau : une échéance
// est un jour, pas un instant. L'affichage (Africa/Douala, JJ/MM/AAAA) est côté front.

export interface YearMonth {
  year: number;
  month: number; // 1..12
}

/** Nombre de jours du mois (month 1..12). */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Date UTC à minuit pour (year, month 1..12, day). */
export function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

/** Extrait {year, month} d'une date (en UTC). */
export function yearMonthOf(date: Date): YearMonth {
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

/** Ajoute `count` mois à un {year, month} (count peut être négatif). */
export function addMonths(ym: YearMonth, count: number): YearMonth {
  const zeroBased = ym.year * 12 + (ym.month - 1) + count;
  return { year: Math.floor(zeroBased / 12), month: (zeroBased % 12) + 1 };
}

/** Compare deux {year, month} : <0, 0, >0. */
export function compareYearMonth(a: YearMonth, b: YearMonth): number {
  return a.year !== b.year ? a.year - b.year : a.month - b.month;
}

/** Jour d'échéance effectif : borné à 28 (RG3) puis au nombre de jours du mois. */
export function effectiveDueDay(dueDay: number, year: number, month: number): number {
  return Math.min(Math.max(dueDay, 1), 28, daysInMonth(year, month));
}

/** Différence en jours entiers (b - a), sur la base calendaire UTC. */
export function diffDays(a: Date, b: Date): number {
  const MS = 86_400_000;
  const da = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const db = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.round((db - da) / MS);
}
