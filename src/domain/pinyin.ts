/** Combining diacritics for tones 1 to 4 (macron, acute, caron, grave); 0 and 5 are neutral. */
const TONE_MARKS: Readonly<Record<string, string>> = {
  '1': '̄',
  '2': '́',
  '3': '̌',
  '4': '̀',
};

/** Letters of one syllable (ü may be typed "v" or "u:"), followed by its tone digit. */
const NUMBERED_SYLLABLE = /((?:u:|[a-zü])+)([0-5])/gi;
const VOWELS = 'aeiouü';

/** Converts numbered pinyin ("ni3 hao3", "lv4") to pinyin with tone marks ("nǐ hǎo", "lǜ"). */
export function numericToDiacritic(input: string): string {
  return input
    .replace(NUMBERED_SYLLABLE, (_match, letters: string, tone: string) =>
      markTone(withUmlaut(letters), tone),
    )
    .normalize('NFC');
}

function withUmlaut(letters: string): string {
  return letters.replace(/u:|v/g, 'ü').replace(/U:|V/g, 'Ü');
}

function markTone(letters: string, tone: string): string {
  const mark = TONE_MARKS[tone];
  if (mark === undefined) {
    return letters;
  }
  const carrier = toneCarrierIndex(letters.toLowerCase());
  if (carrier === -1) {
    return letters + tone;
  }
  const afterCarrier = carrier + 1;
  return letters.slice(0, afterCarrier) + mark + letters.slice(afterCarrier);
}

/**
 * Standard rule: "a" or "e" first, then the "o" of "ou", otherwise the last vowel.
 * Without any vowel, a syllabic nasal ("ng", "m") carries the tone; -1 means no carrier.
 */
function toneCarrierIndex(letters: string): number {
  for (const candidate of ['a', 'e', 'ou']) {
    const index = letters.indexOf(candidate);
    if (index !== -1) {
      return index;
    }
  }
  const lastVowel = Math.max(...Array.from(VOWELS, (vowel) => letters.lastIndexOf(vowel)));
  return lastVowel === -1 ? letters.search(/[mn]/) : lastVowel;
}
