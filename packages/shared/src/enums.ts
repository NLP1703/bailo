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

export const OTP_PURPOSES = ['SIGNUP', 'LOGIN', 'PASSWORD_RESET', 'CONTRACT_SIGN'] as const;
export type OtpPurpose = (typeof OTP_PURPOSES)[number];

export const TEMPLATE_KINDS = ['REMINDER', 'CONTRACT', 'RECEIPT'] as const;
export type TemplateKind = (typeof TEMPLATE_KINDS)[number];

// ─────────────────────────────────────────────────────────────────────────────
// Nouveaux enums (v2 — paiements intégrés, maintenance, compteurs, dépenses, diaspora)
// ─────────────────────────────────────────────────────────────────────────────

export const PAYMENT_INTENT_STATUSES = [
  'PENDING',    // demande créée, attente du prompt opérateur
  'INITIATED',  // envoyé à l'opérateur, en attente du client
  'SUCCEEDED',  // confirmé par webhook → paiement créé
  'FAILED',     // refusé / timeout
  'CANCELLED',  // annulé par l'utilisateur
] as const;
export type PaymentIntentStatus = (typeof PAYMENT_INTENT_STATUSES)[number];

export const PAYMENT_PROVIDERS = ['MTN_MOMO', 'ORANGE_MONEY', 'MOCK'] as const;
export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number];

export const CONTRACT_STATUSES = ['DRAFT', 'PENDING_SIGNATURE', 'SIGNED', 'TERMINATED'] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

export const INSPECTION_KINDS = ['ENTRY', 'EXIT'] as const;
export type InspectionKind = (typeof INSPECTION_KINDS)[number];

export const INSPECTION_CONDITIONS = ['GOOD', 'FAIR', 'POOR', 'DAMAGED'] as const;
export type InspectionCondition = (typeof INSPECTION_CONDITIONS)[number];

export const MAINTENANCE_STATUSES = ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'DONE', 'CANCELLED'] as const;
export type MaintenanceStatus = (typeof MAINTENANCE_STATUSES)[number];

export const MAINTENANCE_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
export type MaintenancePriority = (typeof MAINTENANCE_PRIORITIES)[number];

export const METER_TYPES = ['WATER', 'ELECTRICITY'] as const;
export type MeterType = (typeof METER_TYPES)[number];

export const EXPENSE_CATEGORIES = [
  'MAINTENANCE',   // travaux, réparations
  'UTILITIES',     // factures eau/électricité du bailleur
  'TAX',           // taxe foncière, patente
  'SALARY',        // salaire gardien, gérant
  'INSURANCE',
  'SUPPLIES',      // fournitures, consommables
  'MARKETING',
  'OTHER',
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const CURRENCIES = ['XAF', 'EUR', 'USD', 'CAD', 'GBP'] as const;
export type Currency = (typeof CURRENCIES)[number];

export const AUDIT_ACTIONS = ['CREATE', 'UPDATE', 'VOID', 'CLOSE', 'DELETE', 'ARCHIVE', 'RESTORE'] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const ANOMALY_KINDS = [
  'LATE_PAYER',       // locataire chroniquement en retard
  'VACANCY_LONG',     // chambre vide trop longtemps
  'PRICE_OUTLIER',    // loyer très éloigné du marché quartier
  'CONSUMPTION_SPIKE',// conso eau/élec anormale
  'MISSING_RECEIPT',  // paiement sans reçu généré
] as const;
export type AnomalyKind = (typeof ANOMALY_KINDS)[number];
