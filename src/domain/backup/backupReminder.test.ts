import { describe, expect, it } from 'vitest';
import { shouldRemindBackup } from './backupReminder';

const today = new Date('2026-11-20T09:00:00.000Z');

describe('shouldRemindBackup', () => {
  it('reminds when the last backup is more than 7 days old and something changed since', () => {
    expect(shouldRemindBackup('2026-11-12T08:59:00.000Z', '2026-11-15T10:00:00.000Z', today)).toBe(
      true,
    );
  });

  it('does not remind when nothing changed since the last backup, however old', () => {
    expect(shouldRemindBackup('2026-01-01T00:00:00.000Z', '2025-12-31T00:00:00.000Z', today)).toBe(
      false,
    );
  });

  it('does not remind within 7 days of the last backup', () => {
    expect(shouldRemindBackup('2026-11-13T09:00:00.000Z', '2026-11-19T10:00:00.000Z', today)).toBe(
      false,
    );
  });

  it('reminds a profile that was never backed up as soon as it holds something', () => {
    expect(shouldRemindBackup(undefined, '2026-11-19T10:00:00.000Z', today)).toBe(true);
  });

  it('does not remind an untouched profile', () => {
    expect(shouldRemindBackup(undefined, undefined, today)).toBe(false);
    expect(shouldRemindBackup('2026-01-01T00:00:00.000Z', undefined, today)).toBe(false);
  });
});
