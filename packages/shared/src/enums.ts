// Enums métier — miroir exact des enums Prisma (mêmes valeurs).
// Définis ici comme tuples `as const` pour être réutilisés par Zod, sans dépendre de @prisma/client.

export const USER_ROLES = ['OWNER', 'MANAGER', 'CARETAKER'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const SITE_TYPES = ['CITE', 'IMMEUBLE', 'MIXTE'] as const;
export type SiteType = (typeof SITE_TYPES)[number];

export const PRORATA_MODES = ['FULL', 'PRORATA'] as const;
export type ProrataMode = (typeof PRORATA_MODES)[number];

export const PENALTY_MODES = ['FIXED', 'PERCENT'] as const;
export type PenaltyMode = (typeof PENALTY_MODES)[number];

export const UNIT_TYPES = ['CHAMBRE', 'STUDIO', 'APPARTEMENT', 'MAISON'] as const;
export type UnitType = (typeof UNIT_TYPES)[number];

export const UNIT_MANUAL_STATUSES = ['AVAILABLE', 'UNAVAILABLE', 'RESERVED'] as const;
export type UnitManualStatus = (typeof UNIT_MANUAL_STATUSES)[number];

// Couleur "vivante" d'une unité (RG18) — calculée, non stockée.
export const UNIT_COLORS = ['GREEN', 'ORANGE', 'RED', 'GREY', 'BLUE'] as const;
export type UnitColor = (typeof UNIT_COLORS)[number];

export const OCCUPANCY_STATUSES = ['ACTIVE', 'NOTICE', 'CLOSED'] as const;
export type OccupancyStatus = (typeof OCCUPANCY_STATUSES)[number];

export const CHARGE_TYPES = [
  'LOYER',
  'CAUTION',
  'EAU',
  'ELECTRICITE',
  'FRAIS',
  'PENALITE',
  'REPARATION',
] as const;
export type ChargeType = (typeof CHARGE_TYPES)[number];

export const CHARGE_STATUSES = [
  'UPCOMING',
  'DUE',
  'PARTIAL',
  'PAID',
  'OVERDUE',
  'CANCELLED',
] as const;
export type ChargeStatus = (typeof CHARGE_STATUSES)[number];

export const PAYMENT_MODES = ['ESPECES', 'MTN_MOMO', 'ORANGE_MONEY', 'VIREMENT', 'AUTRE'] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

export const PAYMENT_STATUSES = ['VALID', 'VOIDED'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const REMINDER_STAGES = [
  'J_MINUS_3',
  'J_0',
  'J_PLUS_5',
  'J_PLUS_15',
  'END_OF_ADVANCE',
] as const;
export type ReminderStage = (typeof REMINDER_STAGES)[number];

export const REMINDER_RECIPIENTS = ['TENANT', 'GUARANTOR', 'BOTH'] as const;
export type ReminderRecipient = (typeof REMINDER_RECIPIENTS)[number];

export const REMINDER_CHANNELS = ['WHATSAPP', 'SMS'] as const;
export type ReminderChannel = (typeof REMINDER_CHANNELS)[number];

export const REMINDER_STATUSES = ['PENDING', 'SENT', 'SKIPPED'] as const;
export type ReminderStatus = (typeof REMINDER_STATUSES)[number];

export const SUBSCRIPTION_PLANS = ['DISCOVERY', 'CITE', 'CITE_PRO', 'MANAGER'] as const;
export type SubscriptionPlan = (typeof SUBSCRIPTION_PLANS)[number];

export const OTP_PURPOSES = ['SIGNUP', 'LOGIN', 'PASSWORD_RESET'] as const;
export type OtpPurpose = (typeof OTP_PURPOSES)[number];

export const TEMPLATE_KINDS = ['REMINDER', 'CONTRACT', 'RECEIPT'] as const;
export type TemplateKind = (typeof TEMPLATE_KINDS)[number];
