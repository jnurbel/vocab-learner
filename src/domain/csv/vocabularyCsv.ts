import {
  checkEntry,
  collectEntries,
  type BulkEntry,
  type BulkInputError,
  type BulkLineError,
  type LineProblem,
} from '../bulkEntryParser';
import { CARD_LIMITS, type Card } from '../card';
import { checkLabelName, type Label } from '../label';
import { normalizeSenses } from '../meaning/senses';
import { failure, success, type Result } from '../result';
import { removeInvisibleControls } from '../safeText';
import { checkText } from '../text';
import {
  BYTE_ORDER_MARK,
  neutralizeFormula,
  parseCsv,
  restoreFormula,
  toCsv,
  type CsvError,
} from './csv';

/** A word read from a CSV row, with the names of its labels (found or created on import). */
export interface CsvEntry extends BulkEntry {
  labelNames: string[];
}

export interface CsvEntries {
  entries: CsvEntry[];
  errors: BulkLineError[];
}

export type CsvInputError = BulkInputError | CsvError;

/** Bounds on an untrusted file, checked before and while reading it. */
export const VOCABULARY_CSV_LIMITS = {
  characters: 1_000_000,
  rows: 5_000,
} as const;

const HEADER = ['terme', 'pinyin', 'sens', 'exemple', 'labels'];
/** First cells that make the first row a header rather than a word. */
const HEADER_FIRST_CELLS = new Set(['terme', 'term', 'mot', 'word']);
const LABEL_SEPARATOR = ',';

/** The words as a CSV file for Excel: UTF-8 with BOM, formulas neutralized. */
export function vocabularyToCsv(cards: readonly Card[], labels: readonly Label[]): string {
  const labelNames = new Map(labels.map(({ id, name }) => [id, name]));
  const rows = cards.map((card) => [
    card.term,
    card.pinyin ?? '',
    card.translation,
    card.example ?? '',
    card.labelIds
      .map((id) => labelNames.get(id))
      .filter((name) => name !== undefined)
      .join(`${LABEL_SEPARATOR} `),
  ]);
  return BYTE_ORDER_MARK + toCsv([HEADER, ...rows].map((row) => row.map(neutralizeFormula)));
}

function isHeader(row: readonly string[]): boolean {
  const firstCell = row.slice(0, 1).join('');
  return HEADER_FIRST_CELLS.has(firstCell.trim().toLowerCase());
}

function readRow(row: readonly string[], lineNumber: number): Result<CsvEntry, LineProblem> {
  if (row.length > HEADER.length) {
    return failure([{ lineNumber, reason: 'tooManyColumns' }]);
  }
  const [term = '', pinyin = '', translation = '', example = '', labels = ''] =
    row.map(restoreFormula);
  const entry = checkEntry(lineNumber, {
    term,
    pinyin,
    translation: normalizeSenses(translation),
  });
  if (!entry.ok) {
    return entry;
  }
  const checkedExample =
    example.trim() === '' ? undefined : checkText(example, CARD_LIMITS.example);
  if (checkedExample?.ok === false) {
    return failure([{ lineNumber, reason: 'exampleTooLong' }]);
  }
  const labelNames = labels
    .split(LABEL_SEPARATOR)
    .map((name) => name.trim())
    .filter((name) => name !== '');
  if (labelNames.some((name) => !checkLabelName(name).ok)) {
    return failure([{ lineNumber, reason: 'labelTooLong' }]);
  }
  return success({
    ...entry.value,
    ...(checkedExample === undefined ? {} : { example: checkedExample.value }),
    labelNames,
  });
}

/** Reads a CSV file of words, checked as the bulk entry; problems are reported by row. */
export function readVocabularyCsv(text: string): Result<CsvEntries, CsvInputError> {
  if (text.length > VOCABULARY_CSV_LIMITS.characters) {
    return failure(['inputTooLong']);
  }
  const parsed = parseCsv(removeInvisibleControls(text));
  if (!parsed.ok) {
    return parsed;
  }
  const rows = parsed.value
    .map((row, index) => ({ row, lineNumber: index + 1 }))
    .filter(({ row, lineNumber }) => !(lineNumber === 1 && isHeader(row)));
  if (rows.length > VOCABULARY_CSV_LIMITS.rows) {
    return failure(['tooManyLines']);
  }
  return success(
    collectEntries(
      rows.map(({ row, lineNumber }) => readRow(row, lineNumber)),
      [],
    ),
  );
}
