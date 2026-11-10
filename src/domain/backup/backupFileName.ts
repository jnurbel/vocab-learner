import { safeFileNamePart } from '../fileName';

/** Longest pseudonym kept in a file name, in code points. */
const PSEUDONYM_MAX_LENGTH = 40;
const FALLBACK_PSEUDONYM = 'profile';

/** `vocab-learner-<pseudo>-<YYYY-MM-DD>.vocab-backup.json`. */
export function backupFileName(profileName: string, day: string): string {
  const pseudonym = safeFileNamePart(profileName, PSEUDONYM_MAX_LENGTH, FALLBACK_PSEUDONYM);
  return `vocab-learner-${pseudonym}-${day}.vocab-backup.json`;
}

/** 'YYYY-MM-DD' of a moment, in the device's time zone (a backup at 23:59 belongs to that day). */
export function localDay(moment: Date): string {
  const twoDigits = (value: number) => String(value).padStart(2, '0');
  return `${String(moment.getFullYear())}-${twoDigits(moment.getMonth() + 1)}-${twoDigits(moment.getDate())}`;
}
