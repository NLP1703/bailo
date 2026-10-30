import { describe, expect, it } from 'vitest';
import { buildUnitViews, siteSummary, withPending, type QueuedOp } from '../derive';
import { remindersForToday } from '../reminders';
import type { ChargeRow, SiteTables } from '../types';

const TODAY = new Date('2026-10-15T10:00:00Z');

function rent(id: string, month: number, paid = 0, amount = 15000): ChargeRow {
  return {
    id,
    occupancyId: 'occ1',
    type: 'LOYER',
    periodMonth: month,
    periodYear: 2026,
    amount,
    dueDate: `2026-${String(month).padStart(2, '0')}-05T00:00:00.000Z`,
    status: 'UPCOMING',
    paid,
  };
}

function tables(charges: ChargeRow[], extra: Partial<SiteTables> = {}): SiteTables {
  return {
    sites: [
      {
        id: 's1',
        name: 'Cité Test',
        graceDays: 0,
        reminderJm3: true,
        reminderJ0: true,
        reminderJp5: true,
        reminderJp15: false,
      },
    ],
    blocks: [{ id: 'b1', siteId: 's1', name: 'Bloc A', sortOrder: 1 }],
    units: [
      {
        id: 'u1',
        siteId: 's1',
        blockId: 'b1',
        code: 'A01',
        baseRent: 15000,
        manualStatus: 'AVAILABLE',
        reservedFor: null,
      },
      {
        id: 'u2',
        siteId: 's1',
        blockId: 'b1',
        code: 'A02',
        baseRent: 15000,
        manualStatus: 'AVAILABLE',
        reservedFor: null,
      },
      {
        id: 'u3',
        siteId: 's1',
        blockId: 'b1',
        code: 'A03',
        baseRent: 15000,
        manualStatus: 'RESERVED',
        reservedFor: 'Paul',
      },
    ],
    tenants: [
      {
        id: 't1',
        name: 'Arnaud',
        phone: '699000001',
        whatsapp: null,
        email: null,
        occupation: null,
        emergencyName: null,
        emergencyPhone: null,
      },
    ],
    guarantors: [],
    occupancies: [
      {
        id: 'occ1',
        unitId: 'u1',
        tenantId: 't1',
        startDate: '2026-08-01T00:00:00.000Z',
        plannedEndDate: null,
        actualEndDate: null,
        monthlyRent: 15000,
        dueDay: 5,
        deposit: 0,
        status: 'ACTIVE',
      },
    ],
    charges,
    payments: [],
    meters: [],
    meter_readings: [],
    tickets: [],
    expenses: [],
    cash_handovers: [],
    ...extra,
  };
}

const payment = (amount: number, opId = 'op1'): QueuedOp => ({
  opId,
  type: 'payment.create',
  siteId: 's1',
  createdAt: TODAY.toISOString(),
  payload: { occupancyId: 'occ1', amount, mode: 'ESPECES' },
});

describe('plan des chambres (RG18)', () => {
  it('rouge avec le reste dû quand des loyers sont en retard', () => {
    const t = tables([rent('c8', 8, 15000), rent('c9', 9, 5000), rent('c10', 10), rent('c11', 11)]);
    const a01 = buildUnitViews(t, TODAY).find((v) => v.unit.code === 'A01')!;
    expect(a01.color).toBe('RED');
    expect(a01.due).toBe(10000 + 15000);
    expect(a01.paidThrough).toEqual({ month: 8, year: 2026 });
    expect(a01.openCharges.map((c) => c.id)).toEqual(['c9', 'c10', 'c11']);
  });

  it('libre en gris, réservée en bleu, à jour en vert', () => {
    const t = tables([rent('c10', 10, 15000), rent('c11', 11)]);
    const views = buildUnitViews(t, TODAY);
    expect(views.map((v) => [v.unit.code, v.color])).toEqual([
      ['A01', 'GREEN'],
      ['A02', 'GREY'],
      ['A03', 'BLUE'],
    ]);
  });

  it('orange quand une échéance tombe dans les 3 jours', () => {
    const t = tables([
      rent('c10', 10, 15000),
      { ...rent('c11', 11), dueDate: '2026-10-17T00:00:00.000Z' },
    ]);
    expect(buildUnitViews(t, TODAY)[0]!.color).toBe('ORANGE');
  });
});

describe('saisies en attente', () => {
  it('un paiement hors-ligne réduit le reste dû comme le fera le serveur (RG5)', () => {
    const t = withPending(tables([rent('c9', 9), rent('c10', 10), rent('c11', 11)]), [
      payment(20000),
    ]);
    const a01 = buildUnitViews(t, TODAY)[0]!;
    expect(a01.due).toBe(10000);
    expect(a01.openCharges[0]).toMatchObject({ id: 'c10', remaining: 10000 });
    expect(a01.payments[0]).toMatchObject({ amount: 20000, pending: true });
  });

  it('deux paiements en attente s’enchaînent sur les échéances suivantes', () => {
    const t = withPending(tables([rent('c9', 9), rent('c10', 10)]), [
      payment(15000, 'a'),
      payment(15000, 'b'),
    ]);
    const a01 = buildUnitViews(t, TODAY)[0]!;
    expect(a01.due).toBe(0);
    expect(a01.color).toBe('GREEN');
  });

  it('les autres opérations ne touchent pas aux soldes', () => {
    const base = tables([rent('c9', 9)]);
    const t = withPending(base, [
      { ...payment(0), type: 'ticket.create', payload: { title: 'Fuite' } },
    ]);
    expect(t.charges).toEqual(base.charges);
  });
});

describe('accueil du gérant (T2)', () => {
  it('encaissé du jour et du mois, impayés, occupation', () => {
    const t = withPending(
      tables([rent('c9', 9), rent('c10', 10)], {
        payments: [
          {
            id: 'p0',
            occupancyId: 'occ1',
            amount: 5000,
            mode: 'ESPECES',
            reference: null,
            paidAt: '2026-10-02T09:00:00.000Z',
            receivedBy: 'u',
            receiptNumber: 'CG-1',
            status: 'VALID',
          },
        ],
      }),
      [payment(10000)],
    );
    const summary = siteSummary(t, buildUnitViews(t, TODAY), TODAY);
    expect(summary.collectedToday).toBe(10000);
    expect(summary.collectedMonth).toBe(15000);
    expect(summary.overdue).toBe(5000 + 15000);
    expect(summary.occupied).toBe(1);
    expect(summary.total).toBe(3);
  });
});

describe('relances du jour (T9, RG11-RG12)', () => {
  it('rappel à J−3 au locataire, retard à J+5 au payeur principal', () => {
    const t = tables([
      { ...rent('c10', 10), dueDate: '2026-10-10T00:00:00.000Z' },
      { ...rent('c11', 11), dueDate: '2026-10-18T00:00:00.000Z' },
    ]);
    const items = remindersForToday(t, buildUnitViews(t, TODAY), TODAY);
    expect(items.map((i) => [i.kind, i.stage, i.amount])).toEqual([
      ['late', 'J_PLUS_5', 15000],
      ['upcoming', 'J_MINUS_3', 15000],
    ]);
    expect(items[0]!.recipient.label).toBe('au locataire');

    const withPayer = tables(t.charges, {
      guarantors: [
        {
          id: 'g1',
          tenantId: 't1',
          name: 'Martin Arnaud',
          phone: '677000002',
          whatsapp: null,
          relationship: 'Père',
          isPrimaryPayer: true,
        },
      ],
    });
    const late = remindersForToday(withPayer, buildUnitViews(withPayer, TODAY), TODAY)[0]!;
    expect(late.recipient).toMatchObject({
      name: 'Martin Arnaud',
      phone: '677000002',
      label: 'au père (payeur)',
    });
    expect(late.message).toContain('Bonjour Martin Arnaud,');
    expect(late.message).toContain('A01');
  });

  it('palier désactivé sur le site : la chambre reste dans « autres retards »', () => {
    const t = tables([{ ...rent('c10', 10), dueDate: '2026-09-30T00:00:00.000Z' }]);
    // J+15 désactivé dans la fixture.
    const items = remindersForToday(t, buildUnitViews(t, TODAY), TODAY);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'late', stage: null, key: 'unit:u1' });
  });

  it('rien sur une échéance réglée (RG12)', () => {
    const t = tables([{ ...rent('c11', 11, 15000), dueDate: '2026-10-18T00:00:00.000Z' }]);
    expect(remindersForToday(t, buildUnitViews(t, TODAY), TODAY)).toHaveLength(0);
  });
});
