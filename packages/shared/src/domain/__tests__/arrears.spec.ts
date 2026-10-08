import { describe, expect, it } from 'vitest';
import { computeChargeStatus } from '../arrears';
import { computeCloseout } from '../closeout';
import { computeUnitColor } from '../unit-color';
import { formatReceiptNumber } from '../receipt';
import { utcDate } from '../dates';

describe('computeChargeStatus (RG7, RG10)', () => {
  const base = {
    amount: 25000,
    dueDate: utcDate(2026, 9, 5),
    graceDays: 0,
    cancelled: false,
  };

  it('payée si Σ = montant (RG7)', () => {
    expect(computeChargeStatus({ ...base, paid: 25000, today: utcDate(2026, 9, 10) })).toBe('PAID');
  });
  it('partielle si 0 < Σ < montant, avant retard', () => {
    expect(computeChargeStatus({ ...base, paid: 10000, today: utcDate(2026, 9, 5) })).toBe(
      'PARTIAL',
    );
  });
  it('due le jour de l’échéance, non payée', () => {
    expect(computeChargeStatus({ ...base, paid: 0, today: utcDate(2026, 9, 5) })).toBe('DUE');
  });
  it('à venir avant l’échéance', () => {
    expect(computeChargeStatus({ ...base, paid: 0, today: utcDate(2026, 9, 1) })).toBe('UPCOMING');
  });
  it('en retard le lendemain, hors délai de grâce (RG10)', () => {
    expect(computeChargeStatus({ ...base, paid: 0, today: utcDate(2026, 9, 6) })).toBe('OVERDUE');
  });
  it('respecte le délai de grâce du site (RG10)', () => {
    expect(
      computeChargeStatus({ ...base, graceDays: 3, paid: 0, today: utcDate(2026, 9, 8) }),
    ).toBe('DUE');
    expect(
      computeChargeStatus({ ...base, graceDays: 3, paid: 0, today: utcDate(2026, 9, 9) }),
    ).toBe('OVERDUE');
  });
  it('annulée reste annulée', () => {
    expect(
      computeChargeStatus({ ...base, cancelled: true, paid: 0, today: utcDate(2026, 9, 9) }),
    ).toBe('CANCELLED');
  });
});

describe('computeCloseout (RG15)', () => {
  it('caution − impayés − retenues = à rembourser', () => {
    const r = computeCloseout({
      depositPaid: 25000,
      unpaidTotal: 10000,
      retenues: [{ amount: 5000, reason: 'peinture' }],
    });
    expect(r.refund).toBe(10000);
  });
  it('reste dû si négatif', () => {
    const r = computeCloseout({ depositPaid: 25000, unpaidTotal: 40000, retenues: [] });
    expect(r.refund).toBe(-15000);
  });
  it('refuse une retenue sans motif', () => {
    expect(() =>
      computeCloseout({
        depositPaid: 25000,
        unpaidTotal: 0,
        retenues: [{ amount: 5000, reason: ' ' }],
      }),
    ).toThrow();
  });
});

describe('computeUnitColor (RG18)', () => {
  const occ = { hasActiveOccupancy: true, hasOverdueCharge: false, hasDueSoonCharge: false };
  it('réservée → bleu', () => {
    expect(computeUnitColor({ manualStatus: 'RESERVED', ...occ })).toBe('BLUE');
  });
  it('libre → gris', () => {
    expect(
      computeUnitColor({
        manualStatus: 'AVAILABLE',
        hasActiveOccupancy: false,
        hasOverdueCharge: false,
        hasDueSoonCharge: false,
      }),
    ).toBe('GREY');
  });
  it('en retard → rouge', () => {
    expect(computeUnitColor({ manualStatus: 'AVAILABLE', ...occ, hasOverdueCharge: true })).toBe(
      'RED',
    );
  });
  it('due < 3 j → orange', () => {
    expect(computeUnitColor({ manualStatus: 'AVAILABLE', ...occ, hasDueSoonCharge: true })).toBe(
      'ORANGE',
    );
  });
  it('à jour → vert', () => {
    expect(computeUnitColor({ manualStatus: 'AVAILABLE', ...occ })).toBe('GREEN');
  });
});

describe('formatReceiptNumber (RG9)', () => {
  it('formate CG-2026-000123', () => {
    expect(formatReceiptNumber('CG', 2026, 123)).toBe('CG-2026-000123');
  });
});
