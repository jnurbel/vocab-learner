import type { Moment, SrsDependencies } from './dependencies';
import { isOnOrAfter, type LocalDay } from './localDay';
import type { Rating, ReviewState } from './reviewState';
import { higherStage, stageOf } from './stage';

export interface AnswerApplied {
  state: ReviewState;
  /** False when the word was already rated today: its memory (FSRS) was left untouched. */
  rated: boolean;
}

/**
 * Records an answer. Only the first answer of a local day updates the memory model, so that
 * repeating a word within minutes does not count as learning it (GAME_DESIGN.md 1.2).
 */
export function applyAnswer(
  state: ReviewState,
  rating: Rating,
  moment: Moment,
  { model, config }: SrsDependencies,
): AnswerApplied {
  const rated = !isOnOrAfter(state.lastRatedDay, moment.today);
  const remembered = rated
    ? { ...state, ...model.review(state, rating, moment.now), lastRatedDay: moment.today }
    : state;
  const answered = recordSuccessDay(remembered, rating, moment.today);
  const peakStage = higherStage(answered.peakStage, stageOf(answered, config));
  return { state: { ...answered, peakStage }, rated };
}

function recordSuccessDay(state: ReviewState, rating: Rating, today: LocalDay): ReviewState {
  if (rating === 'again' || isOnOrAfter(state.lastSuccessDay, today)) {
    return state;
  }
  return { ...state, successDays: state.successDays + 1, lastSuccessDay: today };
}
