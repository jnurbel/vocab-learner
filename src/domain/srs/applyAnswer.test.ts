import { describe, expect, it } from 'vitest';
import { applyAnswer } from './applyAnswer';
import { GAME_CONFIG } from './config';
import { createFsrsMemoryModel } from './fsrsMemoryModel';
import type { MemoryModel } from './memoryModel';
import { createInitialReviewState, type ReviewState } from './reviewState';

const srs = { model: createFsrsMemoryModel(GAME_CONFIG.fsrs), config: GAME_CONFIG };
const morning = { now: new Date('2026-11-06T08:00:00Z'), today: '2026-11-06' };
const evening = { now: new Date('2026-11-06T20:00:00Z'), today: '2026-11-06' };
const nextMorning = { now: new Date('2026-11-07T08:00:00Z'), today: '2026-11-07' };

/** A memory model whose next stability is fixed, to reach a given stage on purpose. */
function withStability(stability: number) {
  const model: MemoryModel = {
    review: (state, _rating, now) => ({
      due: now.toISOString(),
      stability,
      difficulty: 5,
      reps: state.reps + 1,
      lapses: state.lapses,
      state: 'review',
      lastReviewAt: now.toISOString(),
    }),
    retrievability: () => 1,
  };
  return { model, config: GAME_CONFIG };
}

function newWord(): ReviewState {
  return createInitialReviewState('card-1', new Date('2026-11-05T08:00:00Z'));
}

describe('applyAnswer', () => {
  it('updates the memory of a word on its first rated answer of the day', () => {
    const result = applyAnswer(newWord(), 'good', morning, srs);

    expect(result.rated).toBe(true);
    expect(result.state).toMatchObject({
      reps: 1,
      state: 'review',
      lastReviewAt: morning.now.toISOString(),
      lastRatedDay: '2026-11-06',
    });
  });

  it('leaves the memory untouched for later answers on the same day', () => {
    const first = applyAnswer(newWord(), 'again', morning, srs).state;

    const second = applyAnswer(first, 'easy', evening, srs);

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
    const first = applyAnswer(newWord(), 'good', morning, srs).state;

    const next = applyAnswer(first, 'good', nextMorning, srs);

    expect(next.rated).toBe(true);
    expect(next.state.reps).toBe(2);
    expect(next.state.lastRatedDay).toBe('2026-11-07');
  });

  it('does not rate twice when the clock goes back to an earlier day', () => {
    const rated = applyAnswer(newWord(), 'good', nextMorning, srs).state;

    expect(applyAnswer(rated, 'good', morning, srs).rated).toBe(false);
  });

  it('counts a day with a successful answer once', () => {
    const first = applyAnswer(newWord(), 'good', morning, srs).state;
    const second = applyAnswer(first, 'hard', evening, srs).state;

    expect(first).toMatchObject({ successDays: 1, lastSuccessDay: '2026-11-06' });
    expect(second).toMatchObject({ successDays: 1, lastSuccessDay: '2026-11-06' });
    expect(applyAnswer(second, 'good', nextMorning, srs).state).toMatchObject({
      successDays: 2,
      lastSuccessDay: '2026-11-07',
    });
  });

  it('does not count a failed answer as a successful day', () => {
    const state = applyAnswer(newWord(), 'again', morning, srs).state;

    expect(state.successDays).toBe(0);
    expect(state.lastSuccessDay).toBeUndefined();
  });

  it('counts the day as successful when the word is found after a first mistake', () => {
    const missed = applyAnswer(newWord(), 'again', morning, srs).state;

    const found = applyAnswer(missed, 'good', evening, srs);

    expect(found.rated).toBe(false);
    expect(found.state).toMatchObject({ successDays: 1, lastSuccessDay: '2026-11-06' });
    expect(found.state.stability).toBe(missed.stability);
  });

  it('does not count a success again when the clock goes back to an earlier day', () => {
    const succeeded = applyAnswer(newWord(), 'good', nextMorning, srs).state;

    expect(applyAnswer(succeeded, 'good', morning, srs).state.successDays).toBe(1);
  });

  it('raises the record stage when the word reaches a higher stage', () => {
    const stem = {
      ...newWord(),
      reps: 3,
      stability: 2,
      successDays: 1,
      peakStage: 'sprout' as const,
    };

    const grown = applyAnswer(stem, 'good', morning, withStability(5)).state;

    expect(grown.peakStage).toBe('stem');
  });

  it('keeps the record stage when the word is forgotten and its stage goes down', () => {
    const flower = {
      ...newWord(),
      reps: 8,
      stability: 30,
      successDays: 4,
      peakStage: 'flower' as const,
    };

    const forgotten = applyAnswer(flower, 'again', morning, withStability(1)).state;

    expect(forgotten.peakStage).toBe('flower');
  });

  it('raises the record stage when a later success of the day completes a successful day', () => {
    const almostStem = {
      ...newWord(),
      reps: 3,
      stability: 4,
      successDays: 1,
      lastRatedDay: '2026-11-06',
      peakStage: 'sprout' as const,
    };

    expect(applyAnswer(almostStem, 'good', evening, srs).state.peakStage).toBe('stem');
  });

  it('leaves the given state untouched', () => {
    const state = newWord();
    const snapshot = structuredClone(state);

    applyAnswer(state, 'good', morning, srs);

    expect(state).toEqual(snapshot);
  });
});
