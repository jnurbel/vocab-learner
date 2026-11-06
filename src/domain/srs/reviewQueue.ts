import type { Card, Language } from '../card';
import { selectCards } from '../cardSelection';
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

/** Today's quota of new words still available; a malformed quota allows none. */
function newWordsLeft({ newPerDay, newIntroducedToday }: ReviewQueueInput): number {
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
