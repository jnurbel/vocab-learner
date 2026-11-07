import type { SessionResultRecord } from '../progressRecords';
import { applyAnswer } from './applyAnswer';
import type { Moment, SrsDependencies } from './dependencies';
import { ratingFor } from './rating';
import type { ReviewState } from './reviewState';

/** A typed answer just given, with the review state the word had before it. */
export interface GivenAnswer {
  before: ReviewState;
  result: SessionResultRecord;
}

export interface AcceptedAnswer {
  state: ReviewState;
  result: SessionResultRecord;
  /** False when the word was already rated earlier today: its memory was left untouched. */
  rated: boolean;
}

/**
 * "J'avais bon": the learner gave a synonym the card lacks. The answer becomes right, and its
 * rating replaces the one given a moment ago, computed again from the state before it, so that
 * a word never gets two ratings on the same day (GAME_DESIGN.md 1.2).
 */
export function acceptAsCorrect(
  { before, result }: GivenAnswer,
  moment: Moment,
  srs: SrsDependencies,
): AcceptedAnswer {
  if (result.outcome !== 'wrong' && result.outcome !== 'almost') {
    throw new Error('Only a wrong or almost right answer can be accepted');
  }
  const rating = ratingFor(
    'correct',
    { exercise: 'typed', responseMs: 0, hintsUsed: result.hintsUsed ?? 0 },
    srs.config,
  );
  const { state, rated } = applyAnswer(before, rating, moment, srs);
  return { state, rated, result: { ...result, outcome: 'correct', rating } };
}
