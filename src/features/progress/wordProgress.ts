import type { Card, Language } from '../../domain/card';
import type { SrsConfig } from '../../domain/srs/config';
import type { Moment, SrsDependencies } from '../../domain/srs/dependencies';
import { masteryOf, type Mastery } from '../../domain/srs/mastery';
import {
  createInitialReviewState,
  type ReviewState,
  type Stage,
} from '../../domain/srs/reviewState';
import { stageOf } from '../../domain/srs/stage';
import { thirstOf, type Thirst } from '../../domain/srs/thirst';

export interface WordProgress {
  stage: Stage;
  thirst: Thirst;
}

/** The badge of a word in the list; a word never reviewed is a seed. */
export function wordProgress(
  state: ReviewState | undefined,
  moment: Moment,
  srs: SrsDependencies,
): WordProgress {
  return state === undefined
    ? { stage: 'seed', thirst: 0 }
    : { stage: stageOf(state, srs.config), thirst: thirstOf(state, moment, srs) };
}

/** Mastery gauge of a label in each language it has words in. */
export function labelMastery(
  labelId: string,
  cards: readonly Card[],
  states: readonly ReviewState[],
  config: Pick<SrsConfig, 'stageThresholds' | 'masteryStage'>,
): Partial<Record<Language, Mastery>> {
  const stateByCardId = new Map(states.map((state) => [state.cardId, state] as const));
  const statesByLanguage = new Map<Language, ReviewState[]>();
  for (const card of cards) {
    if (card.labelIds.includes(labelId)) {
      // The clock of a fresh state does not matter here: a seed is never mastered.
      const state = stateByCardId.get(card.id) ?? createInitialReviewState(card.id, new Date(0));
      statesByLanguage.set(card.language, [...(statesByLanguage.get(card.language) ?? []), state]);
    }
  }
  return Object.fromEntries(
    [...statesByLanguage].map(([language, languageStates]) => [
      language,
      masteryOf(languageStates, config),
    ]),
  );
}
