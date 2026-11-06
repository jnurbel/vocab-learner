import { describe, expect, it } from 'vitest';
import { NEW_PER_DAY_CHOICES, newPerDayOf } from './studySettings';

describe('newPerDayOf', () => {
  it('introduces 5 new words a day when the learner never changed it', () => {
    expect(newPerDayOf(undefined)).toBe(5);
    expect(newPerDayOf({})).toBe(5);
  });

  it('follows the setting of the learner, from 1 to 50', () => {
    expect(newPerDayOf({ newPerDay: 12 })).toBe(12);
    expect(newPerDayOf({ newPerDay: 1 })).toBe(1);
    expect(newPerDayOf({ newPerDay: 50 })).toBe(50);
  });

  it('falls back to 5 for a stored value out of range, fractional or not a number', () => {
    for (const newPerDay of [0, -3, 51, 1e9, 2.5, Number.NaN, Infinity]) {
      expect(newPerDayOf({ newPerDay })).toBe(5);
    }
    // A tampered database or backup may hold any type.
    expect(newPerDayOf({ newPerDay: '10' as unknown as number })).toBe(5);
  });
});

describe('NEW_PER_DAY_CHOICES', () => {
  it('offers a few valid choices, the default among them', () => {
    expect(NEW_PER_DAY_CHOICES).toEqual([3, 5, 8, 10, 15, 20, 30]);
    expect(
      NEW_PER_DAY_CHOICES.every((choice) => newPerDayOf({ newPerDay: choice }) === choice),
    ).toBe(true);
  });
});
