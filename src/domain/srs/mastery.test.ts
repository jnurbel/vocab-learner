import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from './config';
import { masteryOf } from './mastery';
import { createInitialReviewState, type ReviewState } from './reviewState';

function word(stability: number, successDays: number, peakStage: ReviewState['peakStage']) {
  return {
    ...createInitialReviewState('card-1', new Date('2026-11-01T08:00:00Z')),
    reps: 5,
    stability,
    successDays,
    peakStage,
    state: 'review' as const,
  };
}

const seed = createInitialReviewState('seed', new Date('2026-11-01T08:00:00Z'));
const sprout = word(1, 1, 'sprout');
const stem = word(3, 2, 'stem');
const lantern = word(80, 6, 'lantern');

describe('masteryOf', () => {
  it('counts the words at the stem stage or higher among all the words of the label', () => {
    expect(masteryOf([seed, sprout, stem, lantern], GAME_CONFIG)).toEqual({
      mastered: 2,
      total: 4,
    });
  });

  it('uses the current stage, not the record: a forgotten flower is no longer mastered', () => {
    const forgottenFlower = word(1.5, 4, 'flower');

    expect(masteryOf([forgottenFlower], GAME_CONFIG)).toEqual({ mastered: 0, total: 1 });
  });

  it('reports an empty label as nothing to master', () => {
    expect(masteryOf([], GAME_CONFIG)).toEqual({ mastered: 0, total: 0 });
  });

  it('follows the configured mastery stage', () => {
    expect(masteryOf([sprout, stem], { ...GAME_CONFIG, masteryStage: 'sprout' })).toEqual({
      mastered: 2,
      total: 2,
    });
  });
});
