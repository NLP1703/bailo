/**
 * Convertit une durée type "15m", "30d", "7h", "45s", "2w" en millisecondes.
 * Utilisé pour calculer les dates d'expiration côté serveur (refresh token).
 */
const UNIT_MS = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
} as const;

export function durationToMs(value: string): number {
  const match = /^(\d+)\s*([smhdw])$/.exec(value.trim());
  if (!match) {
    throw new Error(`Durée invalide: "${value}" (attendu ex. "15m", "30d")`);
  }
  const amount = Number(match[1]);
  const unit = match[2] as keyof typeof UNIT_MS;
  return amount * UNIT_MS[unit];
}
