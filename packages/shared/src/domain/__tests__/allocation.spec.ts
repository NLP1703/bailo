import { describe, expect, it } from 'vitest';
import { allocateFifo, validateManualAllocation, type OpenCharge } from '../allocation';

describe('allocateFifo (RG5–RG7)', () => {
  it('175 000 couvre caution + 6 loyers (critère d’acceptation P2)', () => {
    const open: OpenCharge[] = [
      { chargeId: 'caution', remaining: 25000 },
      ...Array.from({ length: 6 }, (_, i) => ({ chargeId: `loyer-${i + 1}`, remaining: 25000 })),
    ];
    const { lines, leftover } = allocateFifo(175000, open);
    expect(leftover).toBe(0);
    expect(lines).toHaveLength(7);
    expect(lines.every((l) => l.amount === 25000)).toBe(true);
  });

  it('10 000 sur un loyer de 25 000 → partiel, reste 15 000 (critère d’acceptation)', () => {
    const { lines, leftover } = allocateFifo(10000, [{ chargeId: 'loyer', remaining: 25000 }]);
    expect(lines).toEqual([{ chargeId: 'loyer', amount: 10000 }]);
    expect(leftover).toBe(0); // tout le paiement est affecté
  });

  it('affecte du plus ancien au plus récent (RG5)', () => {
    const { lines } = allocateFifo(30000, [
      { chargeId: 'a', remaining: 25000 },
      { chargeId: 'b', remaining: 25000 },
    ]);
    expect(lines).toEqual([
      { chargeId: 'a', amount: 25000 },
      { chargeId: 'b', amount: 5000 },
    ]);
  });

  it('excédent au-delà de la dernière échéance = non affecté (RG6)', () => {
    const { lines, leftover } = allocateFifo(60000, [{ chargeId: 'a', remaining: 25000 }]);
    expect(lines).toEqual([{ chargeId: 'a', amount: 25000 }]);
    expect(leftover).toBe(35000);
  });
});

describe('validateManualAllocation', () => {
  const remaining = new Map([
    ['a', 25000],
    ['b', 25000],
  ]);

  it('accepte une affectation valide', () => {
    expect(() =>
      validateManualAllocation(
        30000,
        [
          { chargeId: 'a', amount: 25000 },
          { chargeId: 'b', amount: 5000 },
        ],
        remaining,
      ),
    ).not.toThrow();
  });

  it('refuse un dépassement du reste dû', () => {
    expect(() =>
      validateManualAllocation(40000, [{ chargeId: 'a', amount: 30000 }], remaining),
    ).toThrow();
  });

  it('refuse une somme supérieure au paiement', () => {
    expect(() =>
      validateManualAllocation(
        20000,
        [
          { chargeId: 'a', amount: 15000 },
          { chargeId: 'b', amount: 10000 },
        ],
        remaining,
      ),
    ).toThrow();
  });
});
