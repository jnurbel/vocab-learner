import { describe, expect, it } from 'vitest';
import { applyAnswer } from './applyAnswer';
import { GAME_CONFIG } from './config';
import { createFsrsMemoryModel } from './fsrsMemoryModel';
import { localDay } from './localDay';
import { createRng, type Rng } from './random';
import { createInitialReviewState, type Rating } from './reviewState';
import { STAGES } from './stage';

const srs = { model: createFsrsMemoryModel(GAME_CONFIG.fsrs), config: GAME_CONFIG };
const RATINGS: readonly Rating[] = ['again', 'hard', 'good', 'easy'];
const HOUR_MS = 3_600_000;

interface Answer {
  now: Date;
  rating: Rating;
}

/** A learner's random history: a few answers some days, gaps of up to two weeks between them. */
function randomHistory(next: Rng): Answer[] {
  const answers: Answer[] = [];
  let time = Date.parse('2026-11-06T06:00:00Z');
  for (let index = 0; index < 60; index++) {
    time += next() < 0.6 ? next() * 3 * HOUR_MS : next() * 14 * 24 * HOUR_MS;
    answers.push({ now: new Date(time), rating: RATINGS[Math.floor(next() * 4)] ?? 'good' });
  }
  return answers;
}

describe('applyAnswer over random histories', () => {
  it.each(Array.from({ length: 40 }, (_, run) => `history-${String(run)}`))(
    'rates each word at most once a day and never lowers its record stage (%s)',
    (seed) => {
      let state = createInitialReviewState('card-1', new Date('2026-11-06T06:00:00Z'));
      const ratedDays: string[] = [];
      const successDays = new Set<string>();

      for (const { now, rating } of randomHistory(createRng(seed))) {
        const today = localDay(now, 4, 'Europe/Paris');
        const previousPeak = STAGES.indexOf(state.peakStage);

        const result = applyAnswer(state, rating, { now, today }, srs);
        state = result.state;

        if (result.rated) ratedDays.push(today);
        if (rating !== 'again') successDays.add(today);
        expect(STAGES.indexOf(state.peakStage)).toBeGreaterThanOrEqual(previousPeak);
      }

      expect(new Set(ratedDays).size).toBe(ratedDays.length);
      expect(state.reps).toBe(ratedDays.length);
      expect(state.successDays).toBe(successDays.size);
    },
  );
});
