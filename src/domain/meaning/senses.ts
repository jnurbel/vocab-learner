/**
 * What separates the senses of a meaning: "contrôler, contrôle / surveiller". The vertical bar
 * is one too, for the words saved with it before it was turned into a slash.
 */
export const SENSE_SEPARATOR = /[,;/|]/;

type SenseSeparator = ',' | ';' | '/' | '|';
/** How each separator is written between two senses; the vertical bar becomes a slash. */
const SEPARATOR_TEXT: Readonly<Record<SenseSeparator, string>> = {
  ',': ', ',
  ';': '; ',
  '/': ' / ',
  '|': ' / ',
};

/**
 * A comma, slash or vertical bar with the spaces around it. A match only starts after a
 * character that is not a space, so that a long run of spaces is scanned once: linear time.
 */
const SPACED_SEPARATOR = /(?<!\s)\s*([,/|])\s*/g;
const DIGIT = /\d/;

export function isSenseSeparator(character: string): character is SenseSeparator {
  return SENSE_SEPARATOR.test(character);
}

/** The separator as written between two senses, with its spaces. */
export function senseSeparatorText(separator: SenseSeparator): string {
  return SEPARATOR_TEXT[separator];
}

/** "2,5" or "1/2": a number, not two senses. */
function isInNumber(match: string, offset: number, text: string): boolean {
  return (
    match !== '|' &&
    DIGIT.test(text.charAt(offset - 1)) &&
    DIGIT.test(text.charAt(offset + match.length))
  );
}

/**
 * The way a meaning is saved: the vertical bar, the field separator of the bulk entry, becomes a
 * slash, and the spaces around the slashes and commas are the same everywhere.
 */
export function normalizeSenses(meaning: string): string {
  return meaning.replace(
    SPACED_SEPARATOR,
    (match: string, separator: SenseSeparator, offset: number, text: string) =>
      isInNumber(match, offset, text) ? match : senseSeparatorText(separator),
  );
}
