import type { Card, Language } from '../card';
import { selectCards } from '../cardSelection';
import type { SrsDependencies } from './dependencies';
import { addDays, isOnOrAfter, localDay, type LocalDay } from './localDay';
import { newWordsLeft } from './reviewQueue';
import type { ReviewState } from './reviewState';

export interface StudyOutlookInput {
  cards: readonly Card[];
  states: readonly ReviewState[];
  today: LocalDay;
  newPerDay: number;
  newIntroducedToday: number;
  language: Language;
  /** Absent or empty: every word of the language. */
  labelIds?: readonly string[];
}

export interface NextReview {
  day: LocalDay;
  count: number;
}

export interface StudyOutlook {
  /** Reviewed words due today and not rated yet today. */
  dueToday: number;
  /** Words already rated today: they come back on a later day. */
  reviewedToday: number;
  /** Reviewed words, not due today, that fall due tomorrow. */
  dueTomorrow: number;
  /** When nothing is due today: the first day with reviews, and how many. */
  nextReview?: NextReview;
  /** New words today's quota still allows. */
  newAvailableToday: number;
  /** New words beyond today's quota: they come on the next days. */
  newWaiting: number;
}

/**
 * Explains today's queue (the same rules as buildReviewQueue): what is due, what was already
 * done, which new words wait for the next days, and when the next reviews come.
 */
export function summarizeStudyOutlook(
  input: StudyOutlookInput,
  { config, timeZone }: Pick<SrsDependencies, 'config' | 'timeZone'>,
): StudyOutlook {
  const cards = selectCards(input.cards, {
    labelIds: input.labelIds ?? [],
    language: input.language,
  });
  const stateByCardId = new Map(input.states.map((state) => [state.cardId, state] as const));
  const tomorrow = addDays(input.today, 1);
  let dueToday = 0;
  let reviewedToday = 0;
  let newWords = 0;
  /** The day each reviewed word not due today comes back: tomorrow at the earliest. */
  const upcoming: LocalDay[] = [];
  for (const card of cards) {
    const state = stateByCardId.get(card.id);
    if (state === undefined || state.reps === 0) {
      newWords += 1;
      continue;
    }
    const dueDay = localDay(new Date(state.due), config.dayStartHour, timeZone);
    const ratedToday = isOnOrAfter(state.lastRatedDay, input.today);
    if (ratedToday) {
      reviewedToday += 1;
    }
    if (!ratedToday && dueDay <= input.today) {
      dueToday += 1;
    } else {
      upcoming.push(dueDay < tomorrow ? tomorrow : dueDay);
    }
  }
  const newAvailableToday = Math.min(newWords, newWordsLeft(input));
  const nextDay = upcoming.reduce<LocalDay | undefined>(
    (earliest, day) => (earliest === undefined || day < earliest ? day : earliest),
    undefined,
  );
  return {
    dueToday,
    reviewedToday,
    dueTomorrow: upcoming.filter((day) => day === tomorrow).length,
    ...(dueToday === 0 && nextDay !== undefined
      ? { nextReview: { day: nextDay, count: upcoming.filter((day) => day === nextDay).length } }
      : {}),
    newAvailableToday,
    newWaiting: newWords - newAvailableToday,
  };
}
