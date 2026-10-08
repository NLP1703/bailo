import { describe, expect, it } from 'vitest';
import { generateRentSchedule, prorataFirstMonthAmount, rentCoveredAmount } from '../schedule';
import { utcDate } from '../dates';

describe('generateRentSchedule (RG1–RG4)', () => {
  it('génère une échéance par mois jusqu’à la fin prévue (incluse)', () => {
    const { charges } = generateRentSchedule({
      startDate: utcDate(2026, 9, 1),
      plannedEndDate: utcDate(2027, 8, 31),
      monthlyRent: 25000,
      dueDay: 1,
      prorataFirstMonth: false,
    });
    expect(charges).toHaveLength(12);
    expect(charges[0]).toMatchObject({ periodYear: 2026, periodMonth: 9, amount: 25000 });
    expect(charges[11]).toMatchObject({ periodYear: 2027, periodMonth: 8 });
  });

  it('sans fin prévue : 12 mois (RG1)', () => {
    const { charges } = generateRentSchedule({
      startDate: utcDate(2026, 9, 15),
      plannedEndDate: null,
      monthlyRent: 30000,
      dueDay: 15,
      prorataFirstMonth: false,
    });
    expect(charges).toHaveLength(12);
  });

  it('jour d’échéance ramené au 28 (RG3)', () => {
    const { charges } = generateRentSchedule({
      startDate: utcDate(2026, 2, 1),
      plannedEndDate: utcDate(2026, 2, 28),
      monthlyRent: 20000,
      dueDay: 31,
      prorataFirstMonth: false,
    });
    expect(charges[0]!.dueDate.getUTCDate()).toBe(28);
  });

  it('1er mois au prorata (RG4)', () => {
    // Entrée le 16/09 (30 jours) → 15 jours occupés → 25000 × 15/30 = 12500.
    expect(prorataFirstMonthAmount(utcDate(2026, 9, 16), 25000)).toBe(12500);
    const { charges } = generateRentSchedule({
      startDate: utcDate(2026, 9, 16),
      plannedEndDate: utcDate(2026, 11, 30),
      monthlyRent: 25000,
      dueDay: 5,
      prorataFirstMonth: true,
    });
    expect(charges[0]!.amount).toBe(12500);
    expect(charges[1]!.amount).toBe(25000); // mois suivants pleins
  });

  it('rentCoveredAmount somme les loyers jusqu’au mois « payé jusqu’à » (import P1)', () => {
    const { charges } = generateRentSchedule({
      startDate: utcDate(2026, 9, 1),
      plannedEndDate: utcDate(2027, 8, 31),
      monthlyRent: 25000,
      dueDay: 1,
      prorataFirstMonth: false,
    });
    // Payé jusqu'à novembre 2026 → 09, 10, 11 = 3 mois.
    expect(rentCoveredAmount(charges, { year: 2026, month: 11 })).toBe(75000);
  });

  it('1er mois plein si le site ne fait pas de prorata (RG4)', () => {
    const { charges } = generateRentSchedule({
      startDate: utcDate(2026, 9, 16),
      plannedEndDate: utcDate(2026, 10, 31),
      monthlyRent: 25000,
      dueDay: 5,
      prorataFirstMonth: false,
    });
    expect(charges[0]!.amount).toBe(25000);
  });
});
