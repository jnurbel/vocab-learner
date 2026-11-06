import { describe, expect, it } from 'vitest';
import { createRng } from './random';

function draws(seed: string, count: number): number[] {
  const next = createRng(seed);
  return Array.from({ length: count }, () => next());
}

describe('createRng', () => {
  it('draws the same sequence from the same seed', () => {
    expect(draws('session-1', 20)).toEqual(draws('session-1', 20));
  });

  it('draws another sequence from another seed', () => {
    expect(draws('session-1', 20)).not.toEqual(draws('session-2', 20));
  });

  it('draws numbers from 0 included to 1 excluded', () => {
    for (const value of draws('bounds', 1000)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('spreads its draws evenly enough to vary exercises', () => {
    const values = draws('spread', 1000);
    const lowHalf = values.filter((value) => value < 0.5).length;

    expect(lowHalf).toBeGreaterThan(400);
    expect(lowHalf).toBeLessThan(600);
  });

  it('accepts an empty or very long seed', () => {
    expect(draws('', 3)).toHaveLength(3);
    expect(draws('x'.repeat(100_000), 3)).toHaveLength(3);
  });
});
