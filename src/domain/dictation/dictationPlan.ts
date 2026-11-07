import type { Card, Language } from '../card';
import { selectCards } from '../cardSelection';
import { createRng, type Rng } from '../srs/random';

export const DICTATION_WORD_COUNT = { min: 5, max: 20, default: 10 } as const;

/** Seconds of silence between two words, or 'manual': the learner moves on. */
export const DICTATION_DELAYS = [3, 5, 8, 12, 'manual'] as const;
export type DictationDelay = (typeof DICTATION_DELAYS)[number];

/** Speech rates of the three speeds (DESIGN.md 6). */
export const DICTATION_RATES = { slow: 0.6, normal: 0.85, fast: 1 } as const;
export type DictationSpeed = keyof typeof DICTATION_RATES;

export interface DictationOptions {
  language: Language;
  /** Empty: every word of the language. */
  labelIds: readonly string[];
  /** From 5 to 20; 10 when absent or not a number. */
  wordCount?: number;
  /** Picks and orders the words at random, the same way for the same seed. */
  shuffle?: boolean;
  seed?: string;
  readTwice?: boolean;
  /** 5 seconds by default. */
  delay?: DictationDelay;
  /** Normal by default. */
  speed?: DictationSpeed;
}

export interface DictationPlan {
  words: Card[];
  readingsPerWord: 1 | 2;
  /** Undefined: the next word waits for the learner. */
  delayMs: number | undefined;
  rate: number;
}

/** What a dictation reads, and how (DESIGN.md 6). */
export function dictationPlan(cards: readonly Card[], options: DictationOptions): DictationPlan {
  const { language, labelIds, shuffle = false, seed = '', delay = 5, speed = 'normal' } = options;
  const candidates = selectCards(cards, { language, labelIds });
  const ordered = shuffle ? shuffled(candidates, createRng(seed)) : candidates;
  return {
    words: ordered.slice(0, wordCountOf(options.wordCount)),
    readingsPerWord: options.readTwice === true ? 2 : 1,
    delayMs: delay === 'manual' ? undefined : delay * 1_000,
    rate: DICTATION_RATES[speed],
  };
}

function wordCountOf(requested: number | undefined): number {
  if (requested === undefined || Number.isNaN(requested)) {
    return DICTATION_WORD_COUNT.default;
  }
  const { min, max } = DICTATION_WORD_COUNT;
  return Math.min(max, Math.max(min, Math.trunc(requested)));
}

/** Fisher-Yates shuffle of a copy. */
function shuffled<T>(items: readonly T[], random: Rng): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other] as T, result[index] as T];
  }
  return result;
}
