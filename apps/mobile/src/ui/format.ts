import { formatFcfa, type PaymentMode, type UnitColor } from '@bailo/shared';

export { formatFcfa };

const MONTHS = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
];

/** « juil. 2026 » */
export function monthLabel(month: number, year?: number): string {
  const name = MONTHS[month - 1] ?? String(month);
  return year ? `${name} ${year}` : name;
}

/** « 12/07/2026 » */
export function shortDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** Montant sans l'unité, pour les cases du plan : « 30 000 ». */
export function amountShort(amount: number): string {
  return formatFcfa(amount).replace(/\s*FCFA$/u, '');
}

export const PAYMENT_MODE_LABELS: Record<PaymentMode, string> = {
  ESPECES: 'Espèces',
  MTN_MOMO: 'MTN MoMo',
  ORANGE_MONEY: 'Orange Money',
  VIREMENT: 'Virement',
  AUTRE: 'Autre',
};

/** Couleurs RG18 des maquettes T3/T4 : fond, texte, libellé. */
export const UNIT_COLOR_STYLE: Record<UnitColor, { bg: string; fg: string; label: string }> = {
  GREEN: { bg: '#DCFCE7', fg: '#14532D', label: 'À jour' },
  ORANGE: { bg: '#FEF3C7', fg: '#78350F', label: 'Échéance proche' },
  RED: { bg: '#FEE2E2', fg: '#7F1D1D', label: 'En retard' },
  GREY: { bg: '#F1F5F9', fg: '#475569', label: 'Libre' },
  BLUE: { bg: '#DBEAFE', fg: '#1E3A8A', label: 'Réservée' },
};

/** Numéro camerounais au format international pour WhatsApp (237…). */
export function whatsappNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.length === 9 ? `237${digits}` : digits;
}
