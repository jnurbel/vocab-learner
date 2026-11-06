/** Longest pseudonym kept in a file name, in code points. */
const PSEUDONYM_MAX_LENGTH = 40;
const FALLBACK_PSEUDONYM = 'profile';

/** Control characters and bidi overrides or isolates: removed outright. */
const INVISIBLE_CONTROLS = /[\p{Cc}\p{Bidi_Control}]/gu;
/** Anything but letters, digits and marks (path separators, dots, spaces...) becomes a dash. */
const UNSAFE_RUN = /[^\p{L}\p{M}\p{N}]+/gu;

/**
 * Turns a free pseudonym into a safe file name part: no path separator, no dot sequence, no
 * invisible character, bounded length.
 */
function safePseudonym(profileName: string): string {
  const words = profileName
    .normalize('NFC')
    .replace(INVISIBLE_CONTROLS, '')
    .replace(UNSAFE_RUN, '-')
    .replace(/^-|-$/g, '');
  const shortened = Array.from(words).slice(0, PSEUDONYM_MAX_LENGTH).join('').replace(/-$/, '');
  return shortened === '' ? FALLBACK_PSEUDONYM : shortened;
}

/** `vocab-learner-<pseudo>-<YYYY-MM-DD>.vocab-backup.json`. */
export function backupFileName(profileName: string, day: string): string {
  return `vocab-learner-${safePseudonym(profileName)}-${day}.vocab-backup.json`;
}
