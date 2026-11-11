import type { PackIssue } from '../../domain/vocabPack';
import { format } from '../../i18n/format';
import fr from '../../i18n/fr.json';

const messages = fr.packImport.issues;

/** Problems with the whole file: their message needs no place. */
const FILE_MESSAGES: Readonly<Record<string, string>> = {
  fileTooLarge: messages.fileTooLarge,
  unreadableFile: messages.unreadableFile,
  invalidJson: messages.invalidJson,
  unrecognized_keys: messages.unexpectedData,
};

/** Codes of the cross-reference checks, by message; any other schema code is an invalid value. */
const PLACED_MESSAGES: Readonly<Record<string, string>> = {
  duplicateWord: messages.duplicateWord,
  duplicateLabel: messages.duplicateLabel,
  unknownLabel: messages.unknownLabel,
  invalid_type: messages.invalidValue,
  invalid_value: messages.invalidValue,
  invalid_format: messages.invalidValue,
  too_small: messages.invalidValue,
  too_big: messages.invalidValue,
  custom: messages.invalidValue,
};

const SHOWN_AT_MOST = 5;
/** `cards.3.term` → the 4th word; `labels.0.name` → the 1st label. */
const PLACE = /^(cards|labels)\.(\d+)\./;

function messageOf({ code, path }: PackIssue): string {
  const fileMessage = FILE_MESSAGES[code];
  if (fileMessage !== undefined) {
    return fileMessage;
  }
  if (path === '' || path === 'format' || path === 'version') {
    return messages.notAPack;
  }
  if ((path === 'cards' || path === 'labels') && code === 'too_big') {
    return messages.tooMany;
  }
  const place = PLACE.exec(`${path}.`);
  const placed = PLACED_MESSAGES[code];
  if (place === null || placed === undefined) {
    return messages.generic;
  }
  const [, list, index] = place;
  const where = format(list === 'cards' ? messages.word : messages.label, {
    number: Number(index) + 1,
  });
  return format(placed, { place: where });
}

/** Why a pack file is refused, in French; places are plain text, never markup. */
export function packIssueMessages(issues: readonly PackIssue[]): string[] {
  if (issues.length === 0) {
    return [messages.generic];
  }
  const shown = [...new Set(issues.map(messageOf))];
  const hidden = shown.length - SHOWN_AT_MOST;
  return hidden > 0
    ? [...shown.slice(0, SHOWN_AT_MOST), format(messages.more, { count: hidden })]
    : shown;
}
