import { describe, expect, it } from 'vitest';
import type { SessionResultRecord } from '../progressRecords';
import { acceptAsCorrect } from './acceptAnswer';
import { applyAnswer } from './applyAnswer';
import { GAME_CONFIG } from './config';
import { createFsrsMemoryModel } from './fsrsMemoryModel';
import type { ReviewState } from './reviewState';

const srs = {
  model: createFsrsMemoryModel({ ...GAME_CONFIG.fsrs, enableFuzz: false }),
  config: GAME_CONFIG,
};
const answeredAt = { now: new Date('2026-11-06T08:00:00Z'), today: '2026-11-06' };
const correctedAt = { now: new Date('2026-11-06T08:00:20Z'), today: '2026-11-06' };

function knownWord(overrides: Partial<ReviewState> = {}): ReviewState {
  return {
    cardId: 'card-1',
    due: '2026-11-06T07:00:00.000Z',
    stability: 4,
    difficulty: 5,
    reps: 3,
    lapses: 0,
    state: 'review',
    lastReviewAt: '2026-11-02T08:00:00.000Z',
    successDays: 2,
    lastSuccessDay: '2026-11-02',
    lastRatedDay: '2026-11-02',
    peakStage: 'stem',
    ...overrides,
  };
}

function wrongAnswer(overrides: Partial<SessionResultRecord> = {}): SessionResultRecord {
  return {
    cardId: 'card-1',
    outcome: 'wrong',
    exercise: 'typeMeaning',
    rating: 'again',
    hintsUsed: 0,
    answer: 'logis',
    at: answeredAt.now.toISOString(),
    ...overrides,
  };
}

describe('acceptAsCorrect', () => {
  it('replaces the "again" of the day by a "good", computed from the state before the answer', () => {
    const before = knownWord();
    const afterAgain = applyAnswer(before, 'again', answeredAt, srs).state;

    const accepted = acceptAsCorrect({ before, result: wrongAnswer() }, correctedAt, srs);

    expect(accepted.state).toEqual(applyAnswer(before, 'good', correctedAt, srs).state);
    expect(accepted.state.reps).toBe(before.reps + 1);
    expect(accepted.state.lapses).toBe(before.lapses);
    expect(accepted.state.stability).toBeGreaterThan(afterAgain.stability);
    expect(accepted.state.lastRatedDay).toBe('2026-11-06');
  });

  it('turns the result into a right answer, keeping what the learner typed and when', () => {
    const accepted = acceptAsCorrect(
      { before: knownWord(), result: wrongAnswer() },
      correctedAt,
      srs,
    );

    expect(accepted.result).toEqual({ ...wrongAnswer(), outcome: 'correct', rating: 'good' });
  });

  it('accepts an "almost" answer too', () => {
    const result = wrongAnswer({ outcome: 'almost', rating: 'hard' });

    expect(acceptAsCorrect({ before: knownWord(), result }, correctedAt, srs).result.rating).toBe(
      'good',
    );
  });

  it('only counts a success for a word already rated earlier today, leaving its memory alone', () => {
    const before = knownWord({ lastRatedDay: '2026-11-06', lastSuccessDay: '2026-11-02' });

    const accepted = acceptAsCorrect({ before, result: wrongAnswer() }, correctedAt, srs);

    expect(accepted.rated).toBe(false);
    expect(accepted.state).toEqual({
      ...before,
      successDays: before.successDays + 1,
      lastSuccessDay: '2026-11-06',
    });
  });

  it('rates a right answer found with a hint as "hard"', () => {
    const result = wrongAnswer({ hintsUsed: 1 });

    expect(acceptAsCorrect({ before: knownWord(), result }, correctedAt, srs).result.rating).toBe(
      'hard',
    );
  });

  it('takes a result that does not tell its hints as found without any', () => {
    const result = wrongAnswer();
    delete result.hintsUsed;

    expect(acceptAsCorrect({ before: knownWord(), result }, correctedAt, srs).result.rating).toBe(
      'good',
    );
  });

  it('refuses to overrule an answer that was already right', () => {
    const result = wrongAnswer({ outcome: 'correct', rating: 'good' });

    expect(() => acceptAsCorrect({ before: knownWord(), result }, correctedAt, srs)).toThrow(
      'Only a wrong or almost right answer can be accepted',
    );
  });
});
