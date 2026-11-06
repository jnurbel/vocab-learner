import type { Card, Language } from '../card';
import { selectCards } from '../cardSelection';

export const DICTATION_WORD_COUNT = { min: 5, max: 20, default: 10 } as const;

export interface DictationOptions {
  language: Language;
  /** Empty: every word of the language. */
  labelIds: readonly string[];
  /** From 5 to 20; 10 when absent or not a number. */
  wordCount?: number;
}

export interface DictationPlan {
  words: Card[];
}

/** What a dictation reads, and how (DESIGN.md 6). */
export function dictationPlan(cards: readonly Card[], options: DictationOptions): DictationPlan {
  const candidates = selectCards(cards, { language: options.language, labelIds: options.labelIds });
  return { words: candidates.slice(0, wordCountOf(options.wordCount)) };
}

function wordCountOf(requested: number | undefined): number {
  if (requested === undefined || Number.isNaN(requested)) {
    return DICTATION_WORD_COUNT.default;
  }
  const { min, max } = DICTATION_WORD_COUNT;
  return Math.min(max, Math.max(min, Math.trunc(requested)));
}
