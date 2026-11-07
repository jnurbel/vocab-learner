import type { Card, Language } from '../card';
import { selectCards } from '../cardSelection';
import { planFocus, type Basket, type FocusPlanning } from '../exam/focusPlan';
import type { SrsDependencies } from './dependencies';
import { isOnOrAfter, type LocalDay } from './localDay';
import { createRng } from './random';
import { createInitialReviewState, type ReviewState } from './reviewState';
import { isDueBy } from './thirst';

export interface ReviewQueueInput {
  cards: readonly Card[];
  states: readonly ReviewState[];
  /** Clock of the fresh states given to new words. */
  now: Date;
  today: LocalDay;
  newPerDay: number;
  newIntroducedToday: number;
  language: Language;
  /** Absent or empty: every word of the language. */
  labelIds?: readonly string[];
  /** Breaks ties reproducibly, e.g. the session id. */
  seed: string;
  /**
   * The labels to work on: their words come first, a test caps the intervals and sets the
   * quota of new words (GAME_DESIGN.md 1.3 and 2). Absent: the plain daily queue.
   */
  focus?: FocusPlanning;
}

export interface ReviewQueueItem {
  card: Card;
  state: ReviewState;
  /** 'review': due today; 'new': never reviewed, introduced today. */
  kind: 'review' | 'new';
}

/**
 * Today's flashcards in one language: the due words, most overdue first, then as many new
 * words as today's quota still allows, earliest added first.
 */
export function buildReviewQueue(
  input: ReviewQueueInput,
  srs: Pick<SrsDependencies, 'config' | 'timeZone'>,
): ReviewQueueItem[] {
  if (input.focus !== undefined) {
    return buildFocusedQueue(input, input.focus, srs);
  }
  const cards = selectCards(input.cards, {
    labelIds: input.labelIds ?? [],
    language: input.language,
  });
  const stateByCardId = new Map(input.states.map((state) => [state.cardId, state] as const));
  const tieBreak = tieBreakerFor(input.seed);

  const reviews: ReviewQueueItem[] = [];
  const newWords: ReviewQueueItem[] = [];
  for (const card of cards) {
    const state = stateByCardId.get(card.id);
    if (state === undefined || state.reps === 0) {
      newWords.push({
        card,
        state: state ?? createInitialReviewState(card.id, input.now),
        kind: 'new',
      });
    } else if (isDueBy(state, input.today, srs) && !isOnOrAfter(state.lastRatedDay, input.today)) {
      reviews.push({ card, state, kind: 'review' });
    }
  }

  reviews.sort((a, b) => compareIso(a.state.due, b.state.due) || tieBreak(a, b));
  newWords.sort((a, b) => compareIso(a.card.createdAt, b.card.createdAt) || tieBreak(a, b));
  return [...reviews, ...newWords.slice(0, newWordsLeft(input))];
}

/**
 * Today's flashcards with labels to work on (GAME_DESIGN.md 1.3): the due words of the pinned
 * labels with a test (nearest test first), then of the other pinned labels, then the new words
 * (pinned labels first, within the test quota and the session cap), then the other due words.
 */
function buildFocusedQueue(
  input: ReviewQueueInput,
  focus: FocusPlanning,
  srs: Pick<SrsDependencies, 'config' | 'timeZone'>,
): ReviewQueueItem[] {
  const plan = planFocus(
    {
      languageCards: selectCards(input.cards, { labelIds: [], language: input.language }),
      states: input.states,
      today: input.today,
      newPerDay: input.newPerDay,
      newIntroducedToday: input.newIntroducedToday,
    },
    focus,
    srs,
  );
  const cards = selectCards(input.cards, {
    labelIds: input.labelIds ?? [],
    language: input.language,
  });
  const stateByCardId = new Map(input.states.map((state) => [state.cardId, state] as const));
  const tieBreak = tieBreakerFor(input.seed);
  const byExam = (a: ReviewQueueItem, b: ReviewQueueItem) =>
    examKey(plan.examDayOf(a.card)).localeCompare(examKey(plan.examDayOf(b.card)));

  const reviews: Record<Basket, ReviewQueueItem[]> = { T1: [], T2: [], T3: [] };
  const focusNew: ReviewQueueItem[] = [];
  const otherNew: ReviewQueueItem[] = [];
  for (const card of cards) {
    const state = stateByCardId.get(card.id);
    if (state === undefined || state.reps === 0) {
      if (plan.mayIntroduce(card)) {
        const item: ReviewQueueItem = {
          card,
          state: state ?? createInitialReviewState(card.id, input.now),
          kind: 'new',
        };
        (plan.isFocusCard(card) ? focusNew : otherNew).push(item);
      }
    } else if (plan.isDue(card, state)) {
      reviews[plan.basketOf(card)].push({ card, state, kind: 'review' });
    }
  }

  const byDue = (a: ReviewQueueItem, b: ReviewQueueItem) =>
    compareIso(a.state.due, b.state.due) || tieBreak(a, b);
  const byAdded = (a: ReviewQueueItem, b: ReviewQueueItem) =>
    compareIso(a.card.createdAt, b.card.createdAt) || tieBreak(a, b);
  const { T1: t1, T2: t2, T3: t3 } = reviews;
  t1.sort((a, b) => byExam(a, b) || byDue(a, b));
  t2.sort(byDue);
  t3.sort(byDue);
  focusNew.sort((a, b) => byExam(a, b) || byAdded(a, b));
  otherNew.sort(byAdded);
  const newWords = focusNew.length > 0 ? focusNew : otherNew;
  const newCount = Math.min(plan.newQuotaLeft, focus.exam.maxNewPerSession);
  return [...t1, ...t2, ...newWords.slice(0, newCount), ...t3];
}

/** Sorts the nearest test first; words without a test come after every test. */
function examKey(examDay: LocalDay | undefined): string {
  return examDay ?? '9999-12-31';
}

/** Today's quota of new words still available; a malformed quota allows none. */
export function newWordsLeft({
  newPerDay,
  newIntroducedToday,
}: Pick<ReviewQueueInput, 'newPerDay' | 'newIntroducedToday'>): number {
  const left = Math.floor(newPerDay - newIntroducedToday);
  return Number.isFinite(left) ? Math.max(0, left) : 0;
}

function compareIso(a: string, b: string): number {
  return Date.parse(a) - Date.parse(b);
}

/** Orders tied items by a draw that depends on the seed and the card only, not the input order. */
function tieBreakerFor(seed: string) {
  const rank = (item: ReviewQueueItem) => createRng(`${seed}:${item.card.id}`)();
  return (a: ReviewQueueItem, b: ReviewQueueItem) => rank(a) - rank(b);
}
