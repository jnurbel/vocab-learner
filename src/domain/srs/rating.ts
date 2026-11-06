import type { SrsConfig } from './config';
import type { Outcome, Rating } from './reviewState';

export interface AnswerContext {
  /** 'choice': pick among options, timed; 'typed': keyboard or IME input, never timed. */
  exercise: 'choice' | 'typed';
  responseMs: number;
  hintsUsed: number;
  /** The "I already know it" button, offered only when a new word is discovered. */
  knownAlready?: boolean;
}

/** FSRS rating of an answer (GAME_DESIGN.md section 1.2). */
export function ratingFor(
  outcome: Outcome,
  answer: AnswerContext,
  config: Pick<SrsConfig, 'choiceSlowMs'>,
): Rating {
  if (answer.knownAlready === true) {
    return 'easy';
  }
  switch (outcome) {
    case 'wrong':
      return 'again';
    case 'correctWithHint':
    case 'almost':
      return 'hard';
    case 'correct':
      return answer.hintsUsed === 0 && isQuickEnough(answer, config.choiceSlowMs) ? 'good' : 'hard';
  }
}

function isQuickEnough(answer: AnswerContext, choiceSlowMs: number): boolean {
  // `<=` is false for NaN: a response time that was not measured never earns `good`.
  return answer.exercise === 'typed' || answer.responseMs <= choiceSlowMs;
}
