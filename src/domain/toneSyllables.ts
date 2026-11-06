export type Tone = 1 | 2 | 3 | 4 | 'neutral';

/** A piece of pinyin: a syllable with its tone, or plain text (spaces, punctuation...). */
export interface PinyinSegment {
  text: string;
  tone?: Tone;
}

/** Combining tone marks, as found once the pinyin is decomposed (NFD). */
const TONE_BY_MARK: ReadonlyMap<string, Tone> = new Map([
  ['̄', 1],
  ['́', 2],
  ['̌', 3],
  ['̀', 4],
]);

const WORD = /([\p{L}\p{M}]+)/u;

/** Splits pinyin with tone marks into syllables and their tone, for display. */
export function toneSegments(pinyin: string): PinyinSegment[] {
  return pinyin
    .normalize('NFD')
    .split(WORD)
    .filter((piece) => piece !== '')
    .map((piece) =>
      WORD.test(piece)
        ? { text: piece.normalize('NFC'), tone: toneOf(piece) }
        : { text: piece.normalize('NFC') },
    );
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
