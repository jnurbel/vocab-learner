import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from './config';
import type { MemoryModel } from './memoryModel';
import { createInitialReviewState, type ReviewState } from './reviewState';
import { thirstOf } from './thirst';

/** A memory model whose recall estimate is fixed. */
function recalling(probability: number) {
  const model: MemoryModel = {
    review: () => {
      throw new Error('not expected to review');
    },
    retrievability: () => probability,
  };
  return { model, config: GAME_CONFIG, timeZone: 'Europe/Paris' };
}

const moment = { now: new Date('2026-11-06T14:00:00Z'), today: '2026-11-06' };

function reviewedWordDue(due: string): ReviewState {
  return {
    ...createInitialReviewState('card-1', new Date('2026-11-01T08:00:00Z')),
    reps: 2,
    stability: 4,
    state: 'review',
    due,
  };
}

describe('thirstOf', () => {
  it('shows no thirst for a word never reviewed', () => {
    const seed = createInitialReviewState('card-1', new Date('2026-11-01T08:00:00Z'));

    expect(thirstOf(seed, moment, recalling(0))).toBe(0);
  });

  it('shows no thirst for a word due on a later day', () => {
    // 04:00 on 7 November in Paris is the first instant of the next local day.
    expect(thirstOf(reviewedWordDue('2026-11-07T03:00:00Z'), moment, recalling(0.2))).toBe(0);
  });

  it('shows thirst for a word due later today, even in the small hours', () => {
    // 03:59 on 7 November in Paris still belongs to 6 November.
    expect(thirstOf(reviewedWordDue('2026-11-07T02:59:00Z'), moment, recalling(0.95))).toBe(1);
  });

  it('shows thirst for an overdue word still likely recalled', () => {
    expect(thirstOf(reviewedWordDue('2026-11-02T08:00:00Z'), moment, recalling(0.7))).toBe(1);
  });

  it('shows strong thirst when the recall probability falls below 70 %', () => {
    expect(thirstOf(reviewedWordDue('2026-11-02T08:00:00Z'), moment, recalling(0.69))).toBe(2);
  });
});
