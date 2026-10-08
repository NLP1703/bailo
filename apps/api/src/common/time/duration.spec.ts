import { describe, expect, it } from 'vitest';
import { durationToMs } from './duration';

describe('durationToMs', () => {
  it('convertit les unités', () => {
    expect(durationToMs('45s')).toBe(45_000);
    expect(durationToMs('15m')).toBe(900_000);
    expect(durationToMs('2h')).toBe(7_200_000);
    expect(durationToMs('30d')).toBe(2_592_000_000);
    expect(durationToMs('1w')).toBe(604_800_000);
  });

  it('tolère les espaces', () => {
    expect(durationToMs(' 10 m ')).toBe(600_000);
  });

  it('rejette une durée invalide', () => {
    expect(() => durationToMs('abc')).toThrow();
    expect(() => durationToMs('10y')).toThrow();
  });
});
