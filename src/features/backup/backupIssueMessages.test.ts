import { describe, expect, it } from 'vitest';
import type { BackupIssue } from '../../domain/backup/parseBackup';
import fr from '../../i18n/fr.json';
import { backupIssueMessages } from './backupIssueMessages';

const issue = (code: string, path = '', version?: number): BackupIssue => ({
  path,
  code,
  ...(version === undefined ? {} : { version }),
});

describe('backupIssueMessages', () => {
  it.each([
    'fileTooLarge',
    'unreadableFile',
    'invalidJson',
    'tooDeep',
    'notABackup',
    'fingerprintMismatch',
    'unsupportedVersion',
    'migrationFailed',
  ])('explains in French why a file is refused: %s', (code) => {
    const [message] = backupIssueMessages([issue(code)]);

    expect(message).toBe(fr.backup.issues[code as keyof typeof fr.backup.issues]);
  });

  it('tells which version of the app a too recent file needs', () => {
    expect(backupIssueMessages([issue('newerVersion', 'schemaVersion', 3)])).toEqual([
      'Ce fichier vient d’une version plus récente de l’appli (format 3) : mets l’appli à jour, puis réessaie.',
    ]);
  });

  it('names the place of a forbidden key, an invalid value or a broken reference', () => {
    expect(
      backupIssueMessages([
        issue('forbiddenKey', 'data.__proto__'),
        issue('invalid_type', 'data.cards.0.term'),
        issue('unrecognized_keys', 'data.cards.0'),
        issue('unknownLabel', 'data.cards.1.labelIds.0'),
        issue('duplicateWord', 'data.cards.2.term'),
      ]),
    ).toEqual([
      'Le fichier contient une clé interdite (data.__proto__).',
      'Une donnée du fichier est invalide (data.cards.0.term).',
      'Une donnée du fichier est invalide (data.cards.0).',
      'Le fichier fait référence à un mot ou un label absent (data.cards.1.labelIds.0).',
      'Le fichier contient un doublon (data.cards.2.term).',
    ]);
  });

  it('falls back to a generic message for an unknown code', () => {
    expect(backupIssueMessages([issue('somethingNew', 'x')])).toEqual([fr.backup.issues.generic]);
  });

  it('shows at most five messages, then how many more problems there are', () => {
    const issues = Array.from({ length: 8 }, (_, index) =>
      issue('invalid_type', `data.cards.${String(index)}.term`),
    );

    const messages = backupIssueMessages(issues);

    expect(messages).toHaveLength(6);
    expect(messages[5]).toBe('Et 3 autre(s) problème(s).');
  });

  it('gives a generic message when no problem is detailed', () => {
    expect(backupIssueMessages([])).toEqual([fr.backup.issues.generic]);
  });
});
