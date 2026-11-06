import { describe, expect, it } from 'vitest';
import { backupFileName } from './backupFileName';

const day = '2026-11-05';

describe('backupFileName', () => {
  it('names the file after the profile pseudonym and the day of the backup', () => {
    expect(backupFileName('Léa', day)).toBe(`vocab-learner-Léa-${day}.vocab-backup.json`);
  });

  it.each([
    ['../../etc/passwd', 'etc-passwd'],
    ['..\\Windows\\win.ini', 'Windows-win-ini'],
    ['Léa Martin', 'Léa-Martin'],
    ['猫 cat', '猫-cat'],
  ])('keeps no path separator nor dot sequence from the pseudonym %j', (pseudonym, safe) => {
    expect(backupFileName(pseudonym, day)).toBe(`vocab-learner-${safe}-${day}.vocab-backup.json`);
  });

  it('drops control characters and bidi overrides from the pseudonym', () => {
    const nul = String.fromCodePoint(0x00);
    const bidi = String.fromCodePoint(0x202e, 0x2066);

    expect(backupFileName(`Lé${nul}a${bidi}`, day)).toBe(
      `vocab-learner-Léa-${day}.vocab-backup.json`,
    );
  });

  it('falls back to a neutral name when nothing usable is left', () => {
    const bell = String.fromCodePoint(0x07);

    expect(backupFileName(` ../${bell} `, day)).toBe(
      `vocab-learner-profile-${day}.vocab-backup.json`,
    );
  });

  it('shortens a very long pseudonym', () => {
    const fileName = backupFileName('猫'.repeat(500), day);

    expect(fileName).toBe(`vocab-learner-${'猫'.repeat(40)}-${day}.vocab-backup.json`);
  });

  it('never ends the shortened pseudonym with a dash', () => {
    const fileName = backupFileName(`${'a'.repeat(39)} bcd`, day);

    expect(fileName).toBe(`vocab-learner-${'a'.repeat(39)}-${day}.vocab-backup.json`);
  });
});
