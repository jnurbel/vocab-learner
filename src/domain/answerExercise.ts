import { createRng } from './srs/random';
import type { AnswerMode } from './studySettings';

/** How one flashcard is answered. */
export type AnswerExercise = Exclude<AnswerMode, 'mixed'>;

/**
 * The exercise of the card at `index` in a session. The mixed mode alternates typing the
 * meaning and typing the word; the session seed picks which comes first (GAME_DESIGN.md 0.4).
 */
export function answerExerciseFor(mode: AnswerMode, seed: string, index: number): AnswerExercise {
  if (mode !== 'mixed') {
    return mode;
  }
  const meaningFirst = createRng(seed)() < 0.5;
  return (index % 2 === 0) === meaningFirst ? 'typeMeaning' : 'typeWord';
}
