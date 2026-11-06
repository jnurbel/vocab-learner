import { describe, expect, it } from 'vitest';
import { createInitialReviewState } from './reviewState';

describe('createInitialReviewState', () => {
  it('describes a word never reviewed, due right away and still a seed', () => {
    const now = new Date('2026-11-06T14:00:00Z');

    expect(createInitialReviewState('card-1', now)).toEqual({
      cardId: 'card-1',
      due: '2026-11-06T14:00:00.000Z',
      stability: 0,
      difficulty: 0,
      reps: 0,
      lapses: 0,
      state: 'new',
      successDays: 0,
      peakStage: 'seed',
    });
  });

  it('refuses an invalid clock instead of storing an unreadable due date', () => {
    expect(() => createInitialReviewState('card-1', new Date(Number.NaN))).toThrow(RangeError);
  });
});
