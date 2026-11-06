import { describe, expect, it } from 'vitest';
import { newPerDayOf } from './studySettings';

describe('newPerDayOf', () => {
  it('introduces 5 new words a day when the learner never changed it', () => {
    expect(newPerDayOf(undefined)).toBe(5);
    expect(newPerDayOf({})).toBe(5);
  });

  it('follows the setting of the learner, even zero', () => {
    expect(newPerDayOf({ newPerDay: 12 })).toBe(12);
    expect(newPerDayOf({ newPerDay: 0 })).toBe(0);
  });
});
