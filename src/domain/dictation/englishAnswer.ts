const WHITESPACE = /\s+/gu;
/** Right single quote, left single quote, modifier apostrophe, backtick, acute accent, prime. */
const APOSTROPHES = /[’‘ʼ`´′]/g;
/** "to run" and "run" are the same answer: the infinitive marker is optional. */
const INFINITIVE_MARKER = /^to (?=\S)/;

/** Lower case, single spaces, plain apostrophes: how an English answer is compared. */
export function normalizeEnglish(text: string): string {
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(APOSTROPHES, "'")
    .replace(WHITESPACE, ' ')
    .trim();
}

/** The form two spellings of the same answer share. `text` must be normalized. */
export function canonicalEnglish(text: string): string {
  return text.replace(INFINITIVE_MARKER, '');
}
