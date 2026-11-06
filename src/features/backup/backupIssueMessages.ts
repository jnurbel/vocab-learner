import type { BackupIssue } from '../../domain/backup/parseBackup';
import { format } from '../../i18n/format';
import fr from '../../i18n/fr.json';

const messages = fr.backup.issues;

/** Problems with the whole file: their message needs no place. */
const FILE_MESSAGES: Readonly<Record<string, string>> = {
  fileTooLarge: messages.fileTooLarge,
  unreadableFile: messages.unreadableFile,
  invalidJson: messages.invalidJson,
  tooDeep: messages.tooDeep,
  notABackup: messages.notABackup,
  unsupportedVersion: messages.unsupportedVersion,
  migrationFailed: messages.migrationFailed,
  fingerprintMismatch: messages.fingerprintMismatch,
};

/** Codes of the strict schema (zod) and of the cross-reference checks, by message. */
const PLACED_MESSAGES: Readonly<Record<string, string>> = {
  forbiddenKey: messages.forbiddenKey,
  ...Object.fromEntries(
    [
      'invalid_type',
      'too_big',
      'too_small',
      'invalid_format',
      'not_multiple_of',
      'unrecognized_keys',
      'invalid_union',
      'invalid_key',
      'invalid_element',
      'invalid_value',
      'custom',
    ].map((code) => [code, messages.invalidValue]),
  ),
  unknownLabel: messages.brokenReference,
  unknownCard: messages.brokenReference,
  ...Object.fromEntries(
    [
      'duplicateLabel',
      'duplicateCard',
      'duplicateWord',
      'duplicateReviewState',
      'duplicateIgnoredTerm',
      'duplicateSession',
      'duplicatePath',
    ].map((code) => [code, messages.duplicate]),
  ),
};

const SHOWN_AT_MOST = 5;

function messageOf({ code, path, version }: BackupIssue): string {
  if (code === 'newerVersion') {
    return format(messages.newerVersion, { version: version ?? '?' });
  }
  const placed = PLACED_MESSAGES[code];
  return (
    FILE_MESSAGES[code] ?? (placed === undefined ? messages.generic : format(placed, { path }))
  );
}

/** Why a backup file is refused, in French; the path is shown as plain text, never as markup. */
export function backupIssueMessages(issues: readonly BackupIssue[]): string[] {
  if (issues.length === 0) {
    return [messages.generic];
  }
  const shown = [...new Set(issues.map(messageOf))];
  const hidden = shown.length - SHOWN_AT_MOST;
  return hidden > 0
    ? [...shown.slice(0, SHOWN_AT_MOST), format(messages.more, { count: hidden })]
    : shown;
}
