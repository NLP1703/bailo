import { describe, it, expect } from 'vitest';
import { computeUnitColor } from '../unit-color';

describe('computeUnitColor (RG18)', () => {
  const base = { hasActiveOccupancy: false, hasOverdueCharge: false, hasDueSoonCharge: false };

  it('RESERVED prime toujours (même avec occupation ou retard)', () => {
    expect(computeUnitColor({ ...base, manualStatus: 'RESERVED' })).toBe('BLUE');
    expect(
      computeUnitColor({
        manualStatus: 'RESERVED',
        hasActiveOccupancy: true,
        hasOverdueCharge: true,
        hasDueSoonCharge: false,
      }),
    ).toBe('BLUE');
  });

  it('libre et AVAILABLE → GREY', () => {
    expect(computeUnitColor({ ...base, manualStatus: 'AVAILABLE' })).toBe('GREY');
  });

  it('libre et UNAVAILABLE → GREY', () => {
    expect(computeUnitColor({ ...base, manualStatus: 'UNAVAILABLE' })).toBe('GREY');
  });

  it('occupée à jour → GREEN', () => {
    expect(
      computeUnitColor({ ...base, manualStatus: 'AVAILABLE', hasActiveOccupancy: true }),
    ).toBe('GREEN');
  });

  it('occupée avec échéance due <3j → ORANGE', () => {
    expect(
      computeUnitColor({
        manualStatus: 'AVAILABLE',
        hasActiveOccupancy: true,
        hasOverdueCharge: false,
        hasDueSoonCharge: true,
      }),
    ).toBe('ORANGE');
  });

  it('occupée avec retard → RED (prime sur due <3j)', () => {
    expect(
      computeUnitColor({
        manualStatus: 'AVAILABLE',
        hasActiveOccupancy: true,
        hasOverdueCharge: true,
        hasDueSoonCharge: true,
      }),
    ).toBe('RED');
  });

  it("régression : occupation active prime sur UNAVAILABLE oublié (bug audit MAUD/C01)", () => {
    // Avant correction : renvoyait GREY → chambre occupée affichée « libre ».
    expect(
      computeUnitColor({
        manualStatus: 'UNAVAILABLE',
        hasActiveOccupancy: true,
        hasOverdueCharge: false,
        hasDueSoonCharge: false,
      }),
    ).toBe('GREEN');
    expect(
      computeUnitColor({
        manualStatus: 'UNAVAILABLE',
        hasActiveOccupancy: true,
        hasOverdueCharge: true,
        hasDueSoonCharge: false,
      }),
    ).toBe('RED');
  });
});
