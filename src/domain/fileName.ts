/** Control characters and bidi overrides or isolates: removed outright. */
const INVISIBLE_CONTROLS = /[\p{Cc}\p{Bidi_Control}]/gu;
/** Anything but letters, digits and marks (path separators, dots, spaces...) becomes a dash. */
const UNSAFE_RUN = /[^\p{L}\p{M}\p{N}]+/gu;

/**
 * Turns a free text (a pseudonym, a label name) into a safe file name part: no path separator,
 * no dot sequence, no invisible character, at most `maxLength` code points; `fallback` when
 * nothing is left.
 */
export function safeFileNamePart(text: string, maxLength: number, fallback: string): string {
  const words = text
    .normalize('NFC')
    .replace(INVISIBLE_CONTROLS, '')
    .replace(UNSAFE_RUN, '-')
    .replace(/^-|-$/g, '');
  const shortened = Array.from(words).slice(0, maxLength).join('').replace(/-$/, '');
  return shortened === '' ? fallback : shortened;
}
