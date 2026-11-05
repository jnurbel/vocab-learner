/** Combining diacritics for tones 1 to 4 (macron, acute, caron, grave). */
const TONE_MARKS = ['̄', '́', '̌', '̀'] as const;

const NUMBERED_SYLLABLE = /([a-z]+)([1-4])/g;
const VOWELS = 'aeiou';

/** Converts numbered pinyin ("ni3 hao3") to pinyin with tone marks ("nǐ hǎo"). */
export function numericToDiacritic(input: string): string {
  return input
    .replace(NUMBERED_SYLLABLE, (_match, letters: string, tone: string) => {
      const mark = TONE_MARKS[Number(tone) - 1] ?? '';
      const index = toneCarrierIndex(letters) + 1;
      return letters.slice(0, index) + mark + letters.slice(index);
    })
    .normalize('NFC');
}

/** Standard rule: "a" or "e" first, then the "o" of "ou", otherwise the last vowel. */
function toneCarrierIndex(letters: string): number {
  for (const candidate of ['a', 'e', 'ou']) {
    const index = letters.indexOf(candidate);
    if (index !== -1) {
      return index;
    }
  }
  return Math.max(...Array.from(VOWELS, (vowel) => letters.lastIndexOf(vowel)));
}
