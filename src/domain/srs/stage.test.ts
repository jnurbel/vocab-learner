import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from './config';
import { createInitialReviewState, type ReviewState, type Stage } from './reviewState';
import { stageOf } from './stage';

function word(reps: number, stability: number, successDays: number): ReviewState {
  return {
    ...createInitialReviewState('card-1', new Date('2026-11-06T08:00:00Z')),
    reps,
    stability,
    successDays,
    state: reps === 0 ? 'new' : 'review',
  };
}

describe('stageOf', () => {
  it('shows a seed for a word never reviewed', () => {
    expect(stageOf(word(0, 0, 0), GAME_CONFIG)).toBe('seed');
  });

  it('shows a sprout once the word has been reviewed', () => {
    expect(stageOf(word(1, 0.5, 0), GAME_CONFIG)).toBe('sprout');
  });

  it.each<[number, number, Stage]>([
    [3, 2, 'stem'],
    [7, 3, 'bud'],
    [21, 4, 'flower'],
    [60, 5, 'lantern'],
  ])(
    'reaches the next stage at a stability of %d days and %d successful days',
    (stability, successDays, stage) => {
      expect(stageOf(word(5, stability, successDays), GAME_CONFIG)).toBe(stage);
    },
  );

  it.each<[number, number, Stage]>([
    [2.99, 9, 'sprout'],
    [6.99, 9, 'stem'],
    [20.99, 9, 'bud'],
    [59.99, 9, 'flower'],
  ])('stays below a stage while stability is %d days', (stability, successDays, stage) => {
    expect(stageOf(word(5, stability, successDays), GAME_CONFIG)).toBe(stage);
  });

  it('needs answers on several distinct days: no flower in a single day', () => {
    expect(stageOf(word(1, 100, 1), GAME_CONFIG)).toBe('sprout');
    expect(stageOf(word(3, 100, 2), GAME_CONFIG)).toBe('stem');
    expect(stageOf(word(4, 100, 4), GAME_CONFIG)).toBe('flower');
  });

  it('can go down after the word is forgotten', () => {
    expect(stageOf(word(9, 1.2, 4), GAME_CONFIG)).toBe('sprout');
  });
});
