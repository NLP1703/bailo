import { allocateFifo, computeChargeStatus, computeUnitColor, diffDays } from '@bailo/shared';
import type { PaymentMode } from '@bailo/shared';
import type {
  ChargeRow,
  ChargeView,
  OccupancyRow,
  PaymentRow,
  PendingMarker,
  SiteTables,
  TicketRow,
  UnitView,
} from './types';

/** Opération en file, réduite à ce dont les écrans ont besoin. */
export interface QueuedOp {
  opId: string;
  type: string;
  siteId: string;
  createdAt: string;
  payload: unknown;
}

interface PaymentPayload {
  occupancyId: string;
  amount: number;
  mode: PaymentMode;
  reference?: string;
  paidAt?: string;
  allocations?: Array<{ chargeId: string; amount: number }>;
}

const ACTIVE: ReadonlyArray<OccupancyRow['status']> = ['ACTIVE', 'NOTICE'];

export function isActive(occupancy: OccupancyRow): boolean {
  return ACTIVE.includes(occupancy.status);
}

function byDueDate(a: ChargeRow, b: ChargeRow): number {
  return a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id);
}

/**
 * Tables du site avec les saisies en attente déjà prises en compte : un paiement saisi
 * hors-ligne apparaît tout de suite dans l'historique et réduit le reste dû, avec la
 * même affectation que fera le serveur (RG5 : plus anciennes échéances d'abord).
 */
export function withPending(tables: SiteTables, queue: QueuedOp[]): SiteTables {
  const payments: Array<PaymentRow & PendingMarker> = [...tables.payments];
  const extraPaid = new Map<string, number>();
  const paidOf = (c: ChargeRow) => (c.paid ?? 0) + (extraPaid.get(c.id) ?? 0);

  for (const op of queue) {
    if (op.type !== 'payment.create') continue;
    const p = op.payload as PaymentPayload;
    payments.push({
      id: op.opId,
      occupancyId: p.occupancyId,
      amount: p.amount,
      mode: p.mode,
      reference: p.reference ?? null,
      paidAt: p.paidAt ?? op.createdAt,
      receivedBy: '',
      receiptNumber: '',
      status: 'VALID',
      pending: true,
    });
    const open = tables.charges
      .filter((c) => c.occupancyId === p.occupancyId && c.status !== 'CANCELLED')
      .sort(byDueDate)
      .map((c) => ({ chargeId: c.id, remaining: c.amount - paidOf(c) }))
      .filter((c) => c.remaining > 0);
    const lines = p.allocations?.length ? p.allocations : allocateFifo(p.amount, open).lines;
    for (const line of lines) {
      extraPaid.set(line.chargeId, (extraPaid.get(line.chargeId) ?? 0) + line.amount);
    }
  }

  // Autres saisies : visibles tout de suite dans leurs listes, marquées « en attente ».
  const readings = [...tables.meter_readings];
  const tickets = [...tables.tickets];
  const expenses = [...tables.expenses];
  const handovers = [...tables.cash_handovers];
  for (const op of queue) {
    const p = op.payload as Record<string, unknown>;
    if (op.type === 'meterReading.create') {
      const meterId = String(p.meterId);
      const previous = readings
        .filter((r) => r.meterId === meterId)
        .sort((a, b) => b.readAt.localeCompare(a.readAt))[0];
      const value = Number(p.value);
      readings.push({
        id: op.opId,
        meterId,
        readAt: typeof p.readAt === 'string' ? p.readAt : op.createdAt,
        value,
        consumption: previous ? Math.max(0, value - previous.value) : 0,
        pending: true,
      });
    } else if (op.type === 'ticket.create') {
      tickets.push({
        id: op.opId,
        siteId: op.siteId,
        unitId: typeof p.unitId === 'string' ? p.unitId : null,
        title: String(p.title ?? ''),
        description: typeof p.description === 'string' ? p.description : null,
        priority: (p.priority as TicketRow['priority']) ?? 'NORMAL',
        status: 'OPEN',
        reportedAt: op.createdAt,
        pending: true,
      });
    } else if (op.type === 'expense.create') {
      expenses.push({
        id: op.opId,
        siteId: op.siteId,
        category: String(p.category ?? 'OTHER'),
        label: String(p.label ?? ''),
        amount: Number(p.amount ?? 0),
        spentAt: String(p.spentAt ?? op.createdAt),
        pending: true,
      });
    } else if (op.type === 'cashHandover.create') {
      handovers.push({
        id: op.opId,
        collectorId: String(p.collectorId ?? ''),
        periodStart: String(p.periodStart ?? op.createdAt),
        periodEnd: String(p.periodEnd ?? op.createdAt),
        expectedAmount: 0,
        handedAmount: Number(p.handedAmount ?? 0),
        variance: 0,
        note: typeof p.note === 'string' ? p.note : null,
        settledAt: null,
        createdAt: op.createdAt,
        pending: true,
      });
    }
  }

  return {
    ...tables,
    payments,
    meter_readings: readings,
    tickets,
    expenses,
    cash_handovers: handovers,
    charges: tables.charges.map((c) => (extraPaid.has(c.id) ? { ...c, paid: paidOf(c) } : c)),
  };
}

/** Reste dû et statut « vivant » d'une échéance (RG7, RG10). */
export function chargeView(charge: ChargeRow, graceDays: number, today: Date): ChargeView {
  const paidNow = Math.min(charge.paid ?? 0, charge.amount);
  return {
    ...charge,
    paidNow,
    remaining: charge.status === 'CANCELLED' ? 0 : charge.amount - paidNow,
    liveStatus: computeChargeStatus({
      amount: charge.amount,
      paid: paidNow,
      dueDate: new Date(charge.dueDate),
      today,
      graceDays,
      cancelled: charge.status === 'CANCELLED',
    }),
  };
}

/** Échéances ouvertes d'une occupation, dans l'ordre d'affectation (RG5). */
export function openChargesOf(
  tables: SiteTables,
  occupancyId: string,
  graceDays: number,
  today: Date,
): ChargeView[] {
  return tables.charges
    .filter((c) => c.occupancyId === occupancyId)
    .sort(byDueDate)
    .map((c) => chargeView(c, graceDays, today))
    .filter((c) => c.remaining > 0);
}

/** Plan des chambres (T3) et fiches (T4) : une vue par chambre, couleur RG18 comprise. */
export function buildUnitViews(tables: SiteTables, today: Date): UnitView[] {
  const graceDays = tables.sites[0]?.graceDays ?? 0;
  const blocks = new Map(tables.blocks.map((b) => [b.id, b]));
  const tenants = new Map(tables.tenants.map((t) => [t.id, t]));
  const activeByUnit = new Map<string, OccupancyRow>();
  for (const o of tables.occupancies) if (isActive(o)) activeByUnit.set(o.unitId, o);

  return tables.units
    .map((unit): UnitView => {
      const occupancy = activeByUnit.get(unit.id) ?? null;
      const all = occupancy
        ? tables.charges
            .filter((c) => c.occupancyId === occupancy.id)
            .sort(byDueDate)
            .map((c) => chargeView(c, graceDays, today))
        : [];
      const openCharges = all.filter((c) => c.remaining > 0);
      const due = openCharges
        .filter(
          (c) => c.liveStatus === 'OVERDUE' || c.liveStatus === 'DUE' || c.liveStatus === 'PARTIAL',
        )
        .filter((c) => diffDays(new Date(c.dueDate), today) >= 0)
        .reduce((sum, c) => sum + c.remaining, 0);
      const paidRent = all.filter(
        (c) => c.type === 'LOYER' && c.liveStatus === 'PAID' && c.periodMonth && c.periodYear,
      );
      const firstUnpaidRent = all.find((c) => c.type === 'LOYER' && c.liveStatus !== 'PAID');
      const covered = paidRent.filter(
        (c) => !firstUnpaidRent || c.dueDate < firstUnpaidRent.dueDate,
      );
      const lastCovered = covered[covered.length - 1];
      return {
        unit,
        block: unit.blockId ? (blocks.get(unit.blockId) ?? null) : null,
        occupancy,
        tenant: occupancy ? (tenants.get(occupancy.tenantId) ?? null) : null,
        color: computeUnitColor({
          manualStatus: unit.manualStatus,
          hasActiveOccupancy: occupancy !== null,
          hasOverdueCharge: openCharges.some((c) => c.liveStatus === 'OVERDUE'),
          hasDueSoonCharge: openCharges.some((c) => {
            const days = diffDays(today, new Date(c.dueDate));
            return days >= 0 && days <= 3;
          }),
        }),
        due,
        openCharges,
        paidThrough:
          lastCovered?.periodMonth && lastCovered.periodYear
            ? { month: lastCovered.periodMonth, year: lastCovered.periodYear }
            : null,
        payments: occupancy
          ? tables.payments
              .filter((p) => p.occupancyId === occupancy.id && p.status === 'VALID')
              .sort((a, b) => b.paidAt.localeCompare(a.paidAt))
          : [],
      };
    })
    .sort((a, b) => {
      const ba = a.block?.sortOrder ?? Number.MAX_SAFE_INTEGER;
      const bb = b.block?.sortOrder ?? Number.MAX_SAFE_INTEGER;
      return ba - bb || a.unit.code.localeCompare(b.unit.code, 'fr', { numeric: true });
    });
}

/** Indicateurs du site pour l'accueil du gérant (T2). */
export interface SiteSummary {
  collectedToday: number;
  collectedMonth: number;
  /** Reste à encaisser sur les échéances du mois en cours. */
  toCollectMonth: number;
  overdue: number;
  overdueUnits: number;
  occupied: number;
  total: number;
}

export function siteSummary(tables: SiteTables, views: UnitView[], today: Date): SiteSummary {
  const day = today.toISOString().slice(0, 10);
  const month = day.slice(0, 7);
  const valid = tables.payments.filter((p) => p.status === 'VALID');
  const sum = (list: Array<{ amount: number }>) => list.reduce((s, x) => s + x.amount, 0);
  const rentable = views.filter((v) => v.unit.manualStatus !== 'UNAVAILABLE' || v.occupancy);
  const graceDays = tables.sites[0]?.graceDays ?? 0;
  const monthCharges = tables.charges
    .filter((c) => c.dueDate.slice(0, 7) === month)
    .map((c) => chargeView(c, graceDays, today));
  const overdueCharges = views.flatMap((v) =>
    v.openCharges.filter((c) => c.liveStatus === 'OVERDUE'),
  );
  return {
    collectedToday: sum(valid.filter((p) => p.paidAt.slice(0, 10) === day)),
    collectedMonth: sum(valid.filter((p) => p.paidAt.slice(0, 7) === month)),
    toCollectMonth: monthCharges.reduce((s, c) => s + c.remaining, 0),
    overdue: overdueCharges.reduce((s, c) => s + c.remaining, 0),
    overdueUnits: views.filter((v) => v.color === 'RED').length,
    occupied: views.filter((v) => v.occupancy).length,
    total: rentable.length,
  };
}
