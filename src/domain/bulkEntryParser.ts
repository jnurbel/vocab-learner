import type { Language } from './card';
import { numericToDiacritic } from './pinyin';
import { success, type Result } from './result';

/** One word read from a line of the bulk entry; a Chinese word without pinyin still needs one. */
export interface BulkEntry {
  lineNumber: number;
  language: Language;
  term: string;
  pinyin?: string;
  translation: string;
}

export interface BulkLineError {
  lineNumber: number;
  reason: never;
}

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
  text.split(/\r\n|\r|\n/).forEach((line, index) => {
    if (line.trim() !== '') {
      entries.push(parseLine(line, index + 1));
    }
  });
  return success({ entries, errors: [] });
}

/** In order of priority, so that a meaning may contain the weaker separators. */
const SEPARATORS = ['|', '\t', ';'] as const;

function splitFields(line: string): string[] {
  const separator = SEPARATORS.find((candidate) => line.includes(candidate)) ?? '|';
  return line.split(separator).map((field) => field.trim());
}

function parseLine(line: string, lineNumber: number): BulkEntry {
  const fields = splitFields(line);
  const [term = '', pinyin = '', translation = ''] =
    fields.length === 2 ? [fields[0], '', fields[1]] : fields;
  return {
    lineNumber,
    language: detectLanguage(term),
    term,
    ...(pinyin === '' ? {} : { pinyin: numericToDiacritic(pinyin) }),
    translation,
  };
}
