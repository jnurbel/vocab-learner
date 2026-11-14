import type { HskWord } from './sentenceData';

/** The highest HSK level whose words count as known (DESIGN.md 5 ter). */
export const KNOWN_HSK_LEVEL = 3;

/**
 * Grammar particles, and the names and places the bank repeats most (Tom, Mary...): a learner
 * reads them without having them in a list. A short list written for this app.
 */
const ALWAYS_KNOWN = [
  '了',
  '的',
  '得',
  '地',
  '着',
  '过',
  '吗',
  '呢',
  '吧',
  '啊',
  '呀',
  '嘛',
  '们',
  '汤姆',
  '玛丽',
  '约翰',
  '杰克',
  '比尔',
  '露西',
  '肯',
  '日本',
  '美国',
  '英国',
  '法国',
  '德国',
  '东京',
  '上海',
];

/** Longest word tried when an unknown word is cut into known ones. */
const LONGEST_WORD = 4;
/** A pasted sentence longer than this is cut: the workshop asks for 40 characters at most. */
const MAX_SEGMENTED_LENGTH = 200;

const HAN = /\p{Script=Han}/u;
const NUMBER = /^(?:[一二两三四五六七八九十百千万几]+|\d+)$/u;
const NUMBER_PREFIX = /^([一二两三四五六七八九十百千万几]+|\d+)(.+)$/u;
const NUMBER_SUFFIX = /(?<=\p{Script=Han})(?:[二两三四五六七八九十百千万几]+|\d+)$/u;

/** A word is known if it is in HSK 1 to 3 or in the learner's list (any Chinese card). */
export function createKnownWords(
  hsk: ReadonlyMap<string, HskWord>,
  learnerTerms: readonly string[],
): ReadonlySet<string> {
  const known = new Set(ALWAYS_KNOWN);
  for (const [word, { level }] of hsk) {
    if (level <= KNOWN_HSK_LEVEL) {
      known.add(word);
    }
  }
  for (const term of learnerTerms) {
    const trimmed = term.trim();
    if (trimmed !== '') {
      known.add(trimmed);
    }
  }
  return known;
}

/** Cuts an unknown word into known words, longest first (去睡觉 → 去 + 睡觉); undefined if not. */
export function splitIntoKnown(word: string, known: ReadonlySet<string>): string[] | undefined {
  const chars = Array.from(word);
  if (chars.length === 0) {
    return [];
  }
  for (let length = Math.min(LONGEST_WORD, chars.length); length > 0; length--) {
    const head = chars.slice(0, length).join('');
    const rest = known.has(head) ? splitIntoKnown(chars.slice(length).join(''), known) : undefined;
    if (rest !== undefined) {
      return [head, ...rest];
    }
  }
  return undefined;
}

export interface SentenceWord {
  word: string;
  known: boolean;
}

/** Whether a word needs no learning: a number, or anything but Chinese characters. */
function isTrivial(word: string): boolean {
  return NUMBER.test(word) || !HAN.test(word);
}

/** The words of a sentence, an unknown word cut into known ones when it can be. */
export function knownWordsOf(words: readonly string[], known: ReadonlySet<string>): SentenceWord[] {
  return words.flatMap((word): SentenceWord[] => {
    if (known.has(word) || isTrivial(word)) {
      return [{ word, known: true }];
    }
    const pieces = splitIntoKnown(word, known);
    return pieces === undefined
      ? [{ word, known: false }]
      : pieces.map((piece) => ({ word: piece, known: true }));
  });
}

/** The words and punctuation of a Chinese text, as Intl.Segmenter cuts them, spaces left out. */
export function segmentChinese(text: string): string[] {
  const segmenter = new Intl.Segmenter('zh', { granularity: 'word' });
  return Array.from(
    segmenter.segment(Array.from(text).slice(0, MAX_SEGMENTED_LENGTH).join('')),
    ({ segment }) => segment,
  ).filter((segment) => segment.trim() !== '');
}

/**
 * Cuts a number glued to its measure word or to its noun (三本书 → 三 + 本 + 书, 三书 → 三 + 书),
 * or to the word before it (有三 + 妹妹 → 有 + 三 + 妹妹), as the segmenter often glues them:
 * the frequent errors are looked for on these words.
 */
export function splitNumbers(
  words: readonly string[],
  classifiers: ReadonlySet<string>,
  nouns: ReadonlySet<string>,
): string[] {
  const countable = (word: string | undefined) =>
    word !== undefined && (nouns.has(word) || classifiers.has(word.charAt(0)));
  return words.flatMap((word, index) => {
    if (NUMBER.test(word)) {
      return [word];
    }
    const parts = NUMBER_PREFIX.exec(word);
    const [number, rest] = [parts?.[1], parts?.[2]];
    if (number === undefined || rest === undefined) {
      const end = NUMBER_SUFFIX.exec(word)?.[0];
      return end !== undefined && countable(words[index + 1])
        ? [word.slice(0, -end.length), end]
        : [word];
    }
    const [first = '', ...others] = Array.from(rest);
    if (classifiers.has(first)) {
      return others.length > 0 ? [number, first, others.join('')] : [number, first];
    }
    return nouns.has(rest) ? [number, rest] : [word];
  });
}
