/** Couleurs de Bailo (mêmes valeurs que le site et les maquettes). */
export const colors = {
  brand: '#0F766E',
  brandDark: '#115E59',
  brandSoft: '#F0FDFA',
  ground: '#F8FAFC',
  surface: '#FFFFFF',
  border: '#E2E8F0',
  borderStrong: '#CBD5E1',
  text: '#0F172A',
  textSecondary: '#475569',
  danger: '#B91C1C',
  dangerSoft: '#FEE2E2',
  warning: '#78350F',
  warningSoft: '#FEF3C7',
  success: '#15803D',
} as const;

/** Zones tactiles d'au moins 48 dp (NFM11). */
export const touch = { min: 48, button: 56 } as const;
