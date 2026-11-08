import type { Card, Language } from '../card';
import type { Rng } from '../srs/random';
import type { Outcome } from '../srs/reviewState';
import { similarity } from './distractors';
import type { MiniGameConfig } from './miniGameConfig';
import { containsTerm } from './sentenceListen';
import { shuffle } from './shuffle';

type ShuffleConfig = Pick<MiniGameConfig, 'shuffleMinChunks' | 'shuffleMaxChunks'>;

/** Longest example worth cutting: a stored example has at most 1000 characters. */
const MAX_SENTENCE_LENGTH = 1000;

/**
 * Cuts a sentence into chunks (GAME_DESIGN.md 6.6). Chinese: the words of Intl.Segmenter, each
 * punctuation mark stuck to the word before it, then the smallest neighbouring chunks merged
 * until there are at most `shuffleMaxChunks`. English: the words between spaces.
 */
export function splitSentence(
  sentence: string,
  language: Language,
  config: Pick<MiniGameConfig, 'shuffleMaxChunks'>,
): string[] {
  const text = sentence.slice(0, MAX_SENTENCE_LENGTH).trim();
  if (language === 'en') {
    return text.split(/\s+/).filter((chunk) => chunk !== '');
  }
  const chunks: string[] = [];
  for (const { segment, isWordLike } of new Intl.Segmenter('zh', { granularity: 'word' }).segment(
    text,
  )) {
    if (segment.trim() === '') {
      continue;
    }
    if (isWordLike !== true && chunks.length > 0) {
      chunks.push([...chunks.splice(-1, 1), segment].join(''));
    } else {
      chunks.push(segment);
    }
  }
  return mergeSmallest(chunks, config.shuffleMaxChunks);
}

/** Merges the two neighbours of the shortest total length, until few enough remain. */
function mergeSmallest(chunks: readonly string[], max: number): string[] {
  const merged = [...chunks];
  while (merged.length > max) {
    let best = 0;
    for (let index = 1; index < merged.length - 1; index++) {
      if (pairLength(merged, index) < pairLength(merged, best)) {
        best = index;
      }
    }
    merged.splice(best, 2, merged.slice(best, best + 2).join(''));
  }
  return merged;
}

function pairLength(chunks: readonly string[], index: number): number {
  return Array.from(chunks.slice(index, index + 2).join('')).length;
}

/** The chunks of a word's example, or undefined when it cannot be put back in order. */
export function shuffleSentenceOf(card: Card, config: ShuffleConfig): string[] | undefined {
  const example = card.example?.trim() ?? '';
  const chunks = splitSentence(example, card.language, config);
  const fits = chunks.length >= config.shuffleMinChunks && chunks.length <= config.shuffleMaxChunks;
  return fits && new Set(chunks).size > 1 ? chunks : undefined;
}

/** The chunks in another order, never their own: the drawn order, else reversed, else turned. */
export function shuffleChunks(chunks: readonly string[], rng: Rng): string[] {
  const original = chunks.join('\u0000');
  const drawn = shuffle(chunks, rng);
  if (drawn.join('\u0000') !== original) {
    return drawn;
  }
  const reversed = [...chunks].reverse();
  return reversed.join('\u0000') !== original
    ? reversed
    : [...chunks.slice(1), ...chunks.slice(0, 1)];
}

/** The letters and digits of a sentence: punctuation, spaces, width and English case set aside. */
function comparable(sentence: string, language: Language): string {
  const plain = sentence.normalize('NFKC').replace(/[\p{P}\p{S}\s]/gu, '');
  return language === 'en' ? plain.toLowerCase() : plain;
}

export function sameSentence(given: string, expected: string, language: Language): boolean {
  return comparable(given, language) === comparable(expected, language);
}

/** The chunks placed right from the start: they stay, the rest goes back to the reserve. */
export function correctPrefixLength(placed: readonly string[], chunks: readonly string[]): number {
  const wrongAt = placed.findIndex((chunk, index) => chunk !== chunks[index]);
  return wrongAt === -1 ? placed.length : wrongAt;
}

/**
 * The outcome of a sentence put back: the strings are compared, not the chunks, so that two
 * identical chunks may be swapped. Right at the second try counts as with a hint.
 */
export function shuffleAnswer(
  placed: readonly string[],
  chunks: readonly string[],
  language: Language,
  attempt: number,
): Outcome {
  const separator = language === 'en' ? ' ' : '';
  if (!sameSentence(placed.join(separator), chunks.join(separator), language)) {
    return 'wrong';
  }
  return attempt <= 1 ? 'correct' : 'correctWithHint';
}

/**
 * Level 3: a chunk that does not belong (GAME_DESIGN.md 6.6), the closest-sounding word of the
 * same label, else of the language, that the sentence does not hold.
 */
export function trapChunk(
  target: Card,
  cards: readonly Card[],
  chunks: readonly string[],
  config: Parameters<typeof similarity>[2],
): string | undefined {
  const sentence = chunks.join('');
  const candidates = cards.filter(
    (card) =>
      card.id !== target.id &&
      card.language === target.language &&
      !containsTerm(sentence, card) &&
      !chunks.includes(card.term),
  );
  const sameLabel = candidates.filter((card) =>
    card.labelIds.some((id) => target.labelIds.includes(id)),
  );
  const [closest] = (sameLabel.length > 0 ? sameLabel : candidates)
    .map((card) => ({ card, score: similarity(target, card, config) }))
    .sort((a, b) => b.score - a.score || a.card.id.localeCompare(b.card.id));
  return closest?.card.term;
}
