/**
 * Spaced repetition state of one word. This shape is shared with storage and backup:
 * do not rename or retype its fields without a migration.
 */
export type Stage = 'seed' | 'sprout' | 'stem' | 'bud' | 'flower' | 'lantern';
export type Rating = 'again' | 'hard' | 'good' | 'easy';
export type Outcome = 'correct' | 'correctWithHint' | 'almost' | 'wrong';

export interface ReviewState {
  cardId: string;
  due: string; // ISO 8601 datetime
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  state: 'new' | 'review' | 'relearning';
  lastReviewAt?: string; // ISO 8601
  successDays: number;
  lastSuccessDay?: string; // 'YYYY-MM-DD' local day
  lastRatedDay?: string; // 'YYYY-MM-DD' local day
  peakStage: Stage;
}

/** A word never reviewed: due immediately, so that it can be introduced today. */
export function createInitialReviewState(cardId: string, now: Date): ReviewState {
  return {
    cardId,
    due: now.toISOString(),
    stability: 0,
    difficulty: 0,
    reps: 0,
    lapses: 0,
    state: 'new',
    successDays: 0,
    peakStage: 'seed',
  };
}
