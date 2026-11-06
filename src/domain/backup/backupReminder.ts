/** A backup older than this is worth a reminder, if anything changed since (DESIGN §9.1). */
export const BACKUP_REMINDER_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whether to show the discreet "save your progress" banner. Dates are ISO datetimes; a profile
 * never backed up is reminded as soon as it changed.
 */
export function shouldRemindBackup(
  lastBackupAt: string | undefined,
  lastChangeAt: string | undefined,
  today: Date,
): boolean {
  if (lastChangeAt === undefined) {
    return false;
  }
  if (lastBackupAt === undefined) {
    return true;
  }
  const backupTime = Date.parse(lastBackupAt);
  const changedSince = Date.parse(lastChangeAt) > backupTime;
  return changedSince && today.getTime() - backupTime > BACKUP_REMINDER_DAYS * DAY_MS;
}
