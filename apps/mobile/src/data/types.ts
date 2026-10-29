import type {
  ChargeStatus,
  ChargeType,
  MaintenancePriority,
  MaintenanceStatus,
  MeterType,
  OccupancyStatus,
  PaymentMode,
  UnitColor,
  UnitManualStatus,
} from '@bailo/shared';

/**
 * Lignes reçues du serveur (`GET /sync/pull`), telles que rangées dans la table locale
 * `records`. Seuls les champs utilisés par l'app sont typés ; les dates sont en ISO 8601.
 */

export interface SiteRow {
  id: string;
  name: string;
  graceDays: number;
}

export interface BlockRow {
  id: string;
  siteId: string;
  name: string;
  sortOrder: number;
}

export interface UnitRow {
  id: string;
  siteId: string;
  blockId: string | null;
  code: string;
  baseRent: number;
  manualStatus: UnitManualStatus;
  reservedFor: string | null;
}

export interface TenantRow {
  id: string;
  name: string;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  occupation: string | null;
  emergencyName: string | null;
  emergencyPhone: string | null;
}

export interface GuarantorRow {
  id: string;
  tenantId: string;
  name: string;
  phone: string | null;
  relation?: string | null;
}

export interface OccupancyRow {
  id: string;
  unitId: string;
  tenantId: string;
  startDate: string;
  plannedEndDate: string | null;
  actualEndDate: string | null;
  monthlyRent: number;
  dueDay: number;
  deposit: number;
  status: OccupancyStatus;
}

export interface ChargeRow {
  id: string;
  occupancyId: string;
  type: ChargeType;
  periodMonth: number | null;
  periodYear: number | null;
  amount: number;
  dueDate: string;
  status: ChargeStatus;
  /** Montant déjà payé (paiements valides), calculé par le serveur. */
  paid?: number;
}

export interface PaymentRow {
  id: string;
  occupancyId: string;
  amount: number;
  mode: PaymentMode;
  reference: string | null;
  paidAt: string;
  receivedBy: string;
  receiptNumber: string;
  status: 'VALID' | 'VOIDED';
}

export interface MeterRow {
  id: string;
  unitId: string;
  type: MeterType;
  identifier: string | null;
  unitPrice: number;
  unitLabel: string;
  active: boolean;
}

export interface MeterReadingRow {
  id: string;
  meterId: string;
  readAt: string;
  value: number;
  consumption: number;
}

export interface TicketRow {
  id: string;
  siteId: string;
  unitId: string | null;
  title: string;
  description: string | null;
  priority: MaintenancePriority;
  status: MaintenanceStatus;
  reportedAt: string;
}

export interface ExpenseRow {
  id: string;
  siteId: string | null;
  category: string;
  label: string;
  amount: number;
  spentAt: string;
}

/** Tables locales d'un site. */
export interface SiteTables {
  sites: SiteRow[];
  blocks: BlockRow[];
  units: UnitRow[];
  tenants: TenantRow[];
  guarantors: GuarantorRow[];
  occupancies: OccupancyRow[];
  charges: ChargeRow[];
  payments: PaymentRow[];
  meters: MeterRow[];
  meter_readings: MeterReadingRow[];
  tickets: TicketRow[];
  expenses: ExpenseRow[];
}

/** Saisie faite sur ce téléphone et pas encore confirmée par le serveur. */
export interface PendingMarker {
  pending?: true;
}

/** Échéance avec son état calculé sur le téléphone. */
export interface ChargeView extends ChargeRow {
  paidNow: number;
  remaining: number;
  liveStatus: ChargeStatus;
}

/** Chambre telle qu'affichée sur le plan et la fiche (T3, T4). */
export interface UnitView {
  unit: UnitRow;
  block: BlockRow | null;
  occupancy: OccupancyRow | null;
  tenant: TenantRow | null;
  color: UnitColor;
  /** Reste dû sur les échéances arrivées à terme. */
  due: number;
  /** Échéances ouvertes, de la plus ancienne à la plus récente. */
  openCharges: ChargeView[];
  /** Dernier mois de loyer entièrement payé (« payé jusqu'à »), ou null. */
  paidThrough: { month: number; year: number } | null;
  payments: Array<PaymentRow & PendingMarker>;
}
