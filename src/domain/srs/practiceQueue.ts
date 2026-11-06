import type { Card, Language } from '../card';
import { selectCards } from '../cardSelection';
import { createRng } from './random';

/**
 * Mode of a free practice session: its answers are kept for the history only, they never update
 * the memory model nor count as new words (DESIGN.md, 0.4.0).
 */
export const PRACTICE_MODE = 'practice';

export interface PracticeQueueInput {
  cards: readonly Card[];
  language: Language;
  /** Absent or empty: every word of the language. */
  labelIds?: readonly string[];
  /** Shuffles reproducibly, e.g. the session id. */
  seed: string;
  /** At most this many words; absent: all of them. */
  limit?: number;
}

/** Free practice: every chosen word, whether due or not, in an order fixed by the seed. */
export function buildPracticeQueue(input: PracticeQueueInput): Card[] {
  const cards = selectCards(input.cards, {
    labelIds: input.labelIds ?? [],
    language: input.language,
  });
  // A draw per card, depending on the seed and the card only: the input order does not matter.
  return cards
    .map((card) => ({ card, rank: createRng(`${input.seed}:${card.id}`)() }))
    .sort((a, b) => a.rank - b.rank || a.card.id.localeCompare(b.card.id))
    .map(({ card }) => card)
    .slice(0, wordsAllowed(input.limit));
}

/** A malformed limit (negative, NaN) allows no word rather than an unexpected number. */
function wordsAllowed(limit: number | undefined): number {
  if (limit === undefined) {
    return Infinity;
  }
  const allowed = Math.floor(limit);
  return Number.isNaN(allowed) ? 0 : Math.max(0, allowed);
}
