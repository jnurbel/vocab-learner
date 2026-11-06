import { describe, expect, it } from 'vitest';
import { applyAnswer } from './applyAnswer';
import { GAME_CONFIG } from './config';
import { createFsrsMemoryModel } from './fsrsMemoryModel';
import { createInitialReviewState, type ReviewState } from './reviewState';

const model = createFsrsMemoryModel(GAME_CONFIG.fsrs);
const morning = { now: new Date('2026-11-06T08:00:00Z'), today: '2026-11-06' };
const evening = { now: new Date('2026-11-06T20:00:00Z'), today: '2026-11-06' };
const nextMorning = { now: new Date('2026-11-07T08:00:00Z'), today: '2026-11-07' };

function newWord(): ReviewState {
  return createInitialReviewState('card-1', new Date('2026-11-05T08:00:00Z'));
}

describe('applyAnswer', () => {
  it('updates the memory of a word on its first rated answer of the day', () => {
    const result = applyAnswer(newWord(), 'good', morning, model);

    expect(result.rated).toBe(true);
    expect(result.state).toMatchObject({
      reps: 1,
      state: 'review',
      lastReviewAt: morning.now.toISOString(),
      lastRatedDay: '2026-11-06',
    });
  });

  it('leaves the memory untouched for later answers on the same day', () => {
    const first = applyAnswer(newWord(), 'again', morning, model).state;

    const second = applyAnswer(first, 'easy', evening, model);

    expect(second.rated).toBe(false);
    expect(second.state).toMatchObject({
      reps: first.reps,
      stability: first.stability,
      difficulty: first.difficulty,
      due: first.due,
      lastReviewAt: first.lastReviewAt,
      lastRatedDay: '2026-11-06',
    });
  });

  it('rates the word again on the next local day', () => {
    const first = applyAnswer(newWord(), 'good', morning, model).state;

    const next = applyAnswer(first, 'good', nextMorning, model);

    expect(next.rated).toBe(true);
    expect(next.state.reps).toBe(2);
    expect(next.state.lastRatedDay).toBe('2026-11-07');
  });

  it('does not rate twice when the clock goes back to an earlier day', () => {
    const rated = applyAnswer(newWord(), 'good', nextMorning, model).state;

    expect(applyAnswer(rated, 'good', morning, model).rated).toBe(false);
  });

  it('counts a day with a successful answer once', () => {
    const first = applyAnswer(newWord(), 'good', morning, model).state;
    const second = applyAnswer(first, 'hard', evening, model).state;

    expect(first).toMatchObject({ successDays: 1, lastSuccessDay: '2026-11-06' });
    expect(second).toMatchObject({ successDays: 1, lastSuccessDay: '2026-11-06' });
    expect(applyAnswer(second, 'good', nextMorning, model).state).toMatchObject({
      successDays: 2,
      lastSuccessDay: '2026-11-07',
    });
  });

  it('does not count a failed answer as a successful day', () => {
    const state = applyAnswer(newWord(), 'again', morning, model).state;

    expect(state.successDays).toBe(0);
    expect(state.lastSuccessDay).toBeUndefined();
  });

  it('counts the day as successful when the word is found after a first mistake', () => {
    const missed = applyAnswer(newWord(), 'again', morning, model).state;

    const found = applyAnswer(missed, 'good', evening, model);

    expect(found.rated).toBe(false);
    expect(found.state).toMatchObject({ successDays: 1, lastSuccessDay: '2026-11-06' });
    expect(found.state.stability).toBe(missed.stability);
  });

  it('does not count a success again when the clock goes back to an earlier day', () => {
    const succeeded = applyAnswer(newWord(), 'good', nextMorning, model).state;

    expect(applyAnswer(succeeded, 'good', morning, model).state.successDays).toBe(1);
  });

  it('leaves the given state untouched', () => {
    const state = newWord();
    const snapshot = structuredClone(state);

    applyAnswer(state, 'good', morning, model);

    expect(state).toEqual(snapshot);
  });
});
