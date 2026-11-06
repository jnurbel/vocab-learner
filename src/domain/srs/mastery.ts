import type { SrsConfig } from './config';
import type { ReviewState } from './reviewState';
import { isAtLeast, stageOf } from './stage';

export interface Mastery {
  mastered: number;
  total: number;
}

/**
 * Mastery gauge of a label in one language (GAME_DESIGN.md 3.4), e.g. "18/25 mots maîtrisés".
 * Pass the state of every word of the label: a word never reviewed counts as a seed.
 */
export function masteryOf(
  states: readonly ReviewState[],
  config: Pick<SrsConfig, 'stageThresholds' | 'masteryStage'>,
): Mastery {
  const mastered = states.filter((state) =>
    isAtLeast(stageOf(state, config), config.masteryStage),
  ).length;
  return { mastered, total: states.length };
}
