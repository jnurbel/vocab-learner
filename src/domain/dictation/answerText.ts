/** Longest answer worth comparing: a stored word has at most 100 characters. */
export const MAX_ANSWER_CODE_POINTS = 200;

const LINE_BREAKS_AND_TABS = /[\t\n\r]/g;
/** Control characters, bidi overrides or isolates, and zero-width characters. */
const INVISIBLE = /[\p{Cc}\p{Bidi_Control}\u200B-\u200D\u2060\uFEFF]/gu;

/**
 * Makes an untrusted answer safe to compare: no invisible characters, and a bounded length so
 * that a pasted novel cannot make the comparison slow.
 */
export function cleanAnswer(text: string): string {
  // A code point takes one or two UTF-16 units: this first cut keeps enough of them.
  const bounded = text.slice(0, MAX_ANSWER_CODE_POINTS * 4);
  const visible = bounded.replace(LINE_BREAKS_AND_TABS, ' ').replace(INVISIBLE, '');
  return Array.from(visible).slice(0, MAX_ANSWER_CODE_POINTS).join('');
}
