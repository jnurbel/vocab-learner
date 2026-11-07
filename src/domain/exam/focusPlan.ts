import type { Card } from '../card';
import type { Label } from '../label';
import type { SrsDependencies } from '../srs/dependencies';
import { isOnOrAfter, type LocalDay } from '../srs/localDay';
import type { ReviewState } from '../srs/reviewState';
import { capDueForExam } from './capDueForExam';
import { dailyNewQuota } from './dailyNewQuota';
import type { ExamConfig } from './examConfig';
import { nearestUpcomingExam } from './examCalendar';

/** The labels to work on, and how to plan their tests (GAME_DESIGN.md 1.3 and 2). */
export interface FocusPlanning {
  labels: readonly Label[];
  exam: ExamConfig;
  /** Labels whose test the learner prepares in intensive mode. */
  intensiveLabelIds?: readonly string[];
}

/** Baskets of a due word: T1 a pinned label with a test to come, T2 pinned, T3 the others. */
export type Basket = 'T1' | 'T2' | 'T3';

export interface FocusPlanInput {
  /** Every word of the language: the daily quota counts them all. */
  languageCards: readonly Card[];
  states: readonly ReviewState[];
  today: LocalDay;
  newPerDay: number;
  newIntroducedToday: number;
}

/** What the queue and the outlook need to know about the labels to work on, for one day. */
export interface FocusPlan {
  /** E(card), the nearest test to come (today included). */
  examDayOf(card: Card): LocalDay | undefined;
  basketOf(card: Card): Basket;
  /** The day a reviewed word falls due, its interval capped for its test. */
  dueDayOf(card: Card, state: ReviewState): LocalDay;
  /** Due today, the interval capped for its test, and not rated today yet. */
  isDue(card: Card, state: ReviewState): boolean;
  /** A word of a label tested today is not introduced: the test day is for revision. */
  mayIntroduce(card: Card): boolean;
  isFocusCard(card: Card): boolean;
  /** New words today's quota still allows. */
  newQuotaLeft: number;
}

export function planFocus(
  input: FocusPlanInput,
  focus: FocusPlanning,
  srs: Pick<SrsDependencies, 'config' | 'timeZone'>,
): FocusPlan {
  const { today } = input;
  const pinnedIds = new Set(focus.labels.filter(({ isFocus }) => isFocus).map(({ id }) => id));
  const examDayOf = (card: Card) => nearestUpcomingExam(card, focus.labels, today);
  const isFocusCard = (card: Card) => card.labelIds.some((id) => pinnedIds.has(id));
  const quota = dailyNewQuota(
    {
      cards: input.languageCards,
      states: input.states,
      labels: focus.labels,
      today,
      newPerDay: input.newPerDay,
      intensiveLabelIds: focus.intensiveLabelIds ?? [],
    },
    focus.exam,
  );
  const dueDayOf = (card: Card, state: ReviewState) =>
    capDueForExam(state, examDayOf(card), today, srs, focus.exam);
  return {
    examDayOf,
    dueDayOf,
    isFocusCard,
    basketOf: (card) => {
      if (examDayOf(card) !== undefined) {
        return 'T1';
      }
      return isFocusCard(card) ? 'T2' : 'T3';
    },
    isDue: (card, state) =>
      state.reps > 0 && !isOnOrAfter(state.lastRatedDay, today) && dueDayOf(card, state) <= today,
    mayIntroduce: (card) => examDayOf(card) !== today,
    newQuotaLeft: Math.max(0, quota - input.newIntroducedToday),
  };
}
