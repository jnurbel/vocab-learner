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

export interface BulkEntries {
  entries: BulkEntry[];
  errors: BulkLineError[];
}

export type BulkInputError = never;

const HAN_CHARACTER = /\p{Script=Han}/u;

export function detectLanguage(term: string): Language {
  return HAN_CHARACTER.test(term) ? 'zh' : 'en';
}

/** Parses the bulk entry text, one word per line. Never throws: problems are reported per line. */
export function parseBulkEntry(text: string): Result<BulkEntries, BulkInputError> {
  const entries: BulkEntry[] = [];
  const errors: BulkLineError[] = [];
  const firstLineByKey = new Map<string, number>();

  text.split(/\r\n|\r|\n/).forEach((line, index) => {
    const lineNumber = index + 1;
    if (line.trim() === '') {
      return;
    }
    const parsedLine = parseLine(line, lineNumber);
    if (!parsedLine.ok) {
      errors.push(...parsedLine.errors.map((reason) => ({ lineNumber, reason })));
      return;
    }
    const entry = parsedLine.value;
    const key = termKey(entry.language, entry.term);
    const firstLineNumber = firstLineByKey.get(key);
    if (firstLineNumber !== undefined) {
      errors.push({ lineNumber, reason: 'duplicateInBatch', firstLineNumber });
      return;
    }
    firstLineByKey.set(key, lineNumber);
    entries.push(entry);
  });

  return success({ entries, errors });
}

/** In order of priority, so that a meaning may contain the weaker separators. */
const SEPARATORS = ['|', '\t', ';'] as const;

function splitFields(line: string): string[] {
  const separator = SEPARATORS.find((candidate) => line.includes(candidate)) ?? '|';
  return line.split(separator).map((field) => field.trim());
}

/** Returns the first problem of the line, so that the user fixes one thing at a time. */
function parseLine(line: string, lineNumber: number): Result<BulkEntry, BulkLineReason> {
  const fields = splitFields(line);
  if (fields.length > 3) {
    return failure(['tooManyColumns']);
  }
  const [term = '', pinyin = '', translation = ''] =
    fields.length === 2 ? [fields[0], '', fields[1]] : fields;
  const language = detectLanguage(term);
  const problem = findProblem(language, term, pinyin, translation);
  if (problem !== undefined) {
    return failure([problem]);
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
