import type { Card, Language } from '../card';
import type { Moment, SrsDependencies } from '../srs/dependencies';
import { localDay, type LocalDay } from '../srs/localDay';
import type { ReviewState, Stage } from '../srs/reviewState';
import { isAtLeast, stageOf } from '../srs/stage';
import { thirstOf, type Thirst } from '../srs/thirst';

/** A word of the garden (GAME_DESIGN.md 3.2, 8.6). */
export interface Plant {
  card: Card;
  /** The record stage: the size of the plant, which never shrinks. */
  stage: Stage;
  /** The honest current stage, which may go down after a lapse. */
  currentStage: Stage;
  /** True when the current stage is below the record: drooping leaves, never dead. */
  wilted: boolean;
  thirst: Thirst;
  /** The day of the next review, for a word already reviewed. */
  nextReview?: LocalDay;
}

export interface GardenCounts {
  flowers: number;
  lanterns: number;
  thirsty: number;
}

export interface GardenFilter {
  language: Language;
  /** Only the words of this label; every word of the language when absent. */
  labelId?: string;
  page: number;
  pageSize: number;
}

export interface GardenPage {
  plants: Plant[];
  total: number;
  page: number;
  pageCount: number;
}

export function gardenPlants(
  cards: readonly Card[],
  states: readonly ReviewState[],
  moment: Moment,
  srs: SrsDependencies,
): Plant[] {
  const stateByCardId = new Map(states.map((state) => [state.cardId, state] as const));
  return cards.map((card) => {
    const state = stateByCardId.get(card.id);
    if (state === undefined || state.reps === 0) {
      return { card, stage: 'seed', currentStage: 'seed', wilted: false, thirst: 0 };
    }
    const currentStage = stageOf(state, srs.config);
    return {
      card,
      stage: state.peakStage,
      currentStage,
      wilted: !isAtLeast(currentStage, state.peakStage),
      thirst: thirstOf(state, moment, srs),
      nextReview: localDay(new Date(state.due), srs.config.dayStartHour, srs.timeZone),
    };
  });
}

export function gardenCounts(plants: readonly Plant[]): GardenCounts {
  return {
    flowers: plants.filter(({ stage }) => isAtLeast(stage, 'flower')).length,
    lanterns: plants.filter(({ stage }) => stage === 'lantern').length,
    thirsty: plants.filter(({ thirst }) => thirst > 0).length,
  };
}

/** One page of one language, optionally of one label: many words stay quick to draw. */
export function gardenPage(
  plants: readonly Plant[],
  { language, labelId, page, pageSize }: GardenFilter,
): GardenPage {
  const shown = plants.filter(
    ({ card }) =>
      card.language === language && (labelId === undefined || card.labelIds.includes(labelId)),
  );
  const pageCount = Math.max(1, Math.ceil(shown.length / pageSize));
  const current = Math.min(Math.max(0, page), pageCount - 1);
  return {
    plants: shown.slice(current * pageSize, (current + 1) * pageSize),
    total: shown.length,
    page: current,
    pageCount,
  };
}
