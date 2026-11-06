export type Tone = 1 | 2 | 3 | 4 | 'neutral';

/** A piece of pinyin: a syllable with its tone, or plain text (spaces, punctuation...). */
export interface PinyinSegment {
  text: string;
  tone?: Tone;
}

/** Combining tone marks, as found once the pinyin is decomposed (NFD). */
const TONE_BY_MARK: ReadonlyMap<string, Tone> = new Map([
  ['\u0304', 1],
  ['\u0301', 2],
  ['\u030C', 3],
  ['\u0300', 4],
]);

const TONE_MARK = '[\u0304\u0301\u030C\u0300]';
const INITIAL = '(?:zh|ch|sh|[bpmfdtnlgkhjqxrzcsyw])?';
/** A final ending with a consonant gives it up to the next syllable when a vowel follows. */
const NO_VOWEL_AFTER = '(?![aeiou])';

/** Pinyin finals, ü and ê included (written u after j, q, x, y). */
const FINALS = [
  'a', 'ai', 'an', 'ang', 'ao', 'e', 'ei', 'en', 'eng', 'er', 'ê', 'i', 'ia', 'ian', 'iang',
  'iao', 'ie', 'in', 'ing', 'io', 'iong', 'iu', 'o', 'ong', 'ou', 'u', 'ua', 'uai', 'uan',
  'uang', 'ue', 'ui', 'un', 'uo', 'ü', 'üan', 'üe', 'ün',
] as const; // prettier-ignore

/** Vowels as decomposed (NFD): the tone mark comes after the umlaut of ü or the circumflex of ê. */
const DECOMPOSED_VOWELS: ReadonlyMap<string, string> = new Map([
  ['a', 'a'],
  ['e', 'e'],
  ['i', 'i'],
  ['o', 'o'],
  ['u', 'u'],
  ['ü', 'u\u0308'],
  ['ê', 'e\u0302'],
]);

/** Pattern of a final, each vowel optionally carrying a tone mark. */
function finalPattern(final: string): string {
  return Array.from(final, (letter) => {
    const vowel = DECOMPOSED_VOWELS.get(letter);
    return vowel === undefined ? letter : `${vowel}${TONE_MARK}?`;
  }).join('');
}

/**
 * One sticky pattern per final, plain or with the erhua "r", tried at a given position.
 * The patterns are built from the constants above, never from user input.
 */
/* eslint-disable security/detect-non-literal-regexp */
const SYLLABLE_PATTERNS: readonly RegExp[] = FINALS.flatMap((final) => {
  const pattern = INITIAL + finalPattern(final);
  const endsWithConsonant = /[ngr]$/.test(final);
  const plain = new RegExp(pattern + (endsWithConsonant ? NO_VOWEL_AFTER : ''), 'iy');
  return final === 'er' ? [plain] : [plain, new RegExp(`${pattern}r${NO_VOWEL_AFTER}`, 'iy')];
});
/* eslint-enable security/detect-non-literal-regexp */

const WORD = /([\p{L}\p{M}]+)/u;

/** Splits pinyin with tone marks into syllables and their tone, for display. */
export function toneSegments(pinyin: string): PinyinSegment[] {
  const segments: PinyinSegment[] = [];
  const addPlain = (text: string) => {
    const previous = segments.at(-1);
    if (previous !== undefined && previous.tone === undefined) {
      previous.text += text;
    } else {
      segments.push({ text });
    }
  };
  for (const piece of pinyin.normalize('NFD').split(WORD)) {
    if (piece === '') {
      continue;
    }
    const syllables = WORD.test(piece) ? splitSyllables(piece) : undefined;
    if (syllables === undefined) {
      addPlain(piece.normalize('NFC'));
    } else {
      segments.push(
        ...syllables.map((syllable) => ({
          text: syllable.normalize('NFC'),
          tone: toneOf(syllable),
        })),
      );
    }
  }
  return segments;
}

/**
 * Cuts a decomposed word into syllables, preferring the longest ones; undefined when the word
 * is not pinyin. Dynamic programming from the end keeps it linear, whatever the input.
 */
function splitSyllables(word: string): string[] | undefined {
  /** lengthFrom[i]: length of the first syllable of a full split of word.slice(i). */
  const lengthFrom = new Array<number | undefined>(word.length + 1);
  lengthFrom[word.length] = 0;
  for (let start = word.length - 1; start >= 0; start -= 1) {
    lengthFrom[start] = syllableLengthsAt(word, start).find(
      (length) => lengthFrom[start + length] !== undefined,
    );
  }
  const syllables: string[] = [];
  let start = 0;
  while (start < word.length) {
    const length = lengthFrom[start];
    if (length === undefined) {
      return undefined;
    }
    syllables.push(word.slice(start, start + length));
    start += length;
  }
  return syllables;
}

/** Lengths of the syllables that may start at `start`, longest first; one tone mark at most. */
function syllableLengthsAt(word: string, start: number): number[] {
  const lengths = new Set<number>();
  for (const pattern of SYLLABLE_PATTERNS) {
    pattern.lastIndex = start;
    const match = pattern.exec(word);
    if (match !== null && countToneMarks(match[0]) <= 1) {
      lengths.add(match[0].length);
    }
  }
  return [...lengths].sort((first, second) => second - first);
}

function countToneMarks(syllable: string): number {
  return Array.from(syllable).filter((character) => TONE_BY_MARK.has(character)).length;
}

function toneOf(syllable: string): Tone {
  for (const character of syllable) {
    const tone = TONE_BY_MARK.get(character);
    if (tone !== undefined) {
      return tone;
    }
  }
  return 'neutral';
}
