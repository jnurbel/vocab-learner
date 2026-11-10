import { CARD_LIMITS, termKey, type Language } from './card';
import { numericToDiacritic } from './pinyin';
import { failure, success, type Result } from './result';
import { checkText } from './text';

/** One word read from a line of the bulk entry; a Chinese word without pinyin still needs one. */
export interface BulkEntry {
  lineNumber: number;
  language: Language;
  term: string;
  pinyin?: string;
  translation: string;
  /** A sentence using the word, e.g. the one of a pasted text where it was found. */
  example?: string;
}

export type BulkLineReason =
  | 'missingTerm'
  | 'missingTranslation'
  | 'tooManyColumns'
  | 'pinyinNotAllowed'
  | 'termTooLong'
  | 'pinyinTooLong'
  | 'translationTooLong';

export type BulkLineError =
  | { lineNumber: number; reason: BulkLineReason }
  | { lineNumber: number; reason: 'duplicateInBatch'; firstLineNumber: number };

/** A problem of one line, located by its line number. */
export interface LineProblem {
  lineNumber: number;
  reason: BulkLineReason;
}

export interface BulkEntries {
  entries: BulkEntry[];
  errors: BulkLineError[];
}

export type BulkInputError = 'inputTooLong' | 'tooManyLines';

/** Bounds on untrusted pasted text, checked before any parsing work. */
export const BULK_ENTRY_LIMITS = {
  characters: 20_000,
  lines: 500,
} as const;

const LINE_BREAK = /\r\n|\r|\n/;
const HAN_CHARACTER = /\p{Script=Han}/u;

export function detectLanguage(term: string): Language {
  return HAN_CHARACTER.test(term) ? 'zh' : 'en';
}

/** Parses the bulk entry text, one word per line. Never throws: problems are reported per line. */
export function parseBulkEntry(text: string): Result<BulkEntries, BulkInputError> {
  if (text.length > BULK_ENTRY_LIMITS.characters) {
    return failure(['inputTooLong']);
  }
  const lines = text
    .split(LINE_BREAK)
    .map((line, index) => ({ line, lineNumber: index + 1 }))
    .filter(({ line }) => line.trim() !== '');
  if (lines.length > BULK_ENTRY_LIMITS.lines) {
    return failure(['tooManyLines']);
  }

  return success(
    collectEntries(
      lines.map(({ line, lineNumber }) => parseLine(line, lineNumber)),
      [],
    ),
  );
}

/**
 * Gathers checked lines into a batch: invalid lines and repeated words (after their first line)
 * are reported, together with `previousErrors`, in line order.
 */
export function collectEntries(
  checkedLines: readonly Result<BulkEntry, LineProblem>[],
  previousErrors: readonly BulkLineError[],
): BulkEntries {
  const entries: BulkEntry[] = [];
  const errors: BulkLineError[] = [...previousErrors];
  const firstLineByKey = new Map<string, number>();
  for (const checked of checkedLines) {
    if (!checked.ok) {
      errors.push(...checked.errors);
      continue;
    }
    const entry = checked.value;
    const key = termKey(entry.language, entry.term);
    const firstLineNumber = firstLineByKey.get(key);
    if (firstLineNumber === undefined) {
      firstLineByKey.set(key, entry.lineNumber);
      entries.push(entry);
    } else {
      errors.push({ lineNumber: entry.lineNumber, reason: 'duplicateInBatch', firstLineNumber });
    }
  }
  errors.sort((first, second) => first.lineNumber - second.lineNumber);
  return { entries, errors };
}

/** In order of priority, so that a meaning may contain the weaker separators. */
const SEPARATORS = ['|', '\t', ';'] as const;

function splitFields(line: string): string[] {
  const separator = SEPARATORS.find((candidate) => line.includes(candidate)) ?? '|';
  return line.split(separator).map((field) => field.trim());
}

/** Returns the first problem of the line, so that the user fixes one thing at a time. */
function parseLine(line: string, lineNumber: number): Result<BulkEntry, LineProblem> {
  const fields = splitFields(line);
  if (fields.length > 3) {
    return failure([{ lineNumber, reason: 'tooManyColumns' }]);
  }
  const [term = '', pinyin = '', translation = ''] =
    fields.length === 2 ? [fields[0], '', fields[1]] : fields;
  return checkEntry(lineNumber, { term, pinyin, translation });
}

export interface EntryFields {
  term: string;
  pinyin: string;
  translation: string;
}

/** Checks the fields of one line, typed or corrected in the preview; blank pinyin is absent. */
export function checkEntry(
  lineNumber: number,
  fields: EntryFields,
): Result<BulkEntry, LineProblem> {
  const term = fields.term.trim();
  const pinyin = fields.pinyin.trim();
  const translation = fields.translation.trim();
  const language = detectLanguage(term);
  const problem = findProblem(language, term, pinyin, translation);
  if (problem !== undefined) {
    return failure([{ lineNumber, reason: problem }]);
  }
  return success({
    lineNumber,
    language,
    term,
    ...(pinyin === '' ? {} : { pinyin: numericToDiacritic(pinyin) }),
    translation,
  });
}

function findProblem(
  language: Language,
  term: string,
  pinyin: string,
  translation: string,
): BulkLineReason | undefined {
  if (term === '') {
    return 'missingTerm';
  }
  if (translation === '') {
    return 'missingTranslation';
  }
  if (language === 'en' && pinyin !== '') {
    return 'pinyinNotAllowed';
  }
  if (!checkText(term, CARD_LIMITS.term).ok) {
    return 'termTooLong';
  }
  if (pinyin !== '' && !checkText(pinyin, CARD_LIMITS.pinyin).ok) {
    return 'pinyinTooLong';
  }
  if (!checkText(translation, CARD_LIMITS.translation).ok) {
    return 'translationTooLong';
  }
  return undefined;
}
