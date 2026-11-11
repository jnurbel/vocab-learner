import { failure, success, type Result } from '../result';

/** Tells Excel that the file is UTF-8, so that hanzi and accents open correctly. */
export const BYTE_ORDER_MARK = String.fromCodePoint(0xfeff);

export type CsvError = 'unclosedQuote' | 'misplacedQuote';

/** The separator of Excel in French; a file without any is read with commas, then tabs. */
const DEFAULT_SEPARATOR = ';';

function detectSeparator(text: string): string {
  const lineEnd = text.search(/[\r\n]/);
  const firstLine = lineEnd === -1 ? text : text.slice(0, lineEnd);
  return [';', ',', '\t'].find((candidate) => firstLine.includes(candidate)) ?? DEFAULT_SEPARATOR;
}

/** Reads CSV text (RFC 4180): quoted cells may hold separators, doubled quotes and line breaks. */
export function parseCsv(text: string): Result<string[][], CsvError> {
  const body = text.startsWith(BYTE_ORDER_MARK) ? text.slice(BYTE_ORDER_MARK.length) : text;
  const separator = detectSeparator(body);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let closedQuote = false;

  const endCell = () => {
    row.push(cell);
    cell = '';
    closedQuote = false;
  };
  const endRow = () => {
    endCell();
    // A blank line holds no word.
    if (row.length > 1 || row[0] !== '') {
      rows.push(row);
    }
    row = [];
  };

  for (let index = 0; index < body.length; index += 1) {
    const character = body.charAt(index);
    if (quoted) {
      if (character !== '"') {
        cell += character;
      } else if (body.charAt(index + 1) === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = false;
        closedQuote = true;
      }
    } else if (character === separator) {
      endCell();
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && body.charAt(index + 1) === '\n') {
        index += 1;
      }
      endRow();
    } else if (closedQuote) {
      return failure(['misplacedQuote']);
    } else if (character === '"' && cell === '') {
      quoted = true;
    } else {
      cell += character;
    }
  }
  if (quoted) {
    return failure(['unclosedQuote']);
  }
  endRow();
  return success(rows);
}

const NEEDS_QUOTES = /[;"\r\n]/;

function writeCell(cell: string): string {
  return NEEDS_QUOTES.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell;
}

/** Writes rows as CSV for Excel in French: semicolons, CRLF line ends, quotes only if needed. */
export function toCsv(rows: readonly (readonly string[])[]): string {
  return rows.map((row) => `${row.map(writeCell).join(DEFAULT_SEPARATOR)}\r\n`).join('');
}

/** Characters with which a spreadsheet starts a formula (OWASP, CSV injection). */
const FORMULA_START = /^[=+\-@\t\r]/;
const NEUTRALIZED_FORMULA = /^'[=+\-@\t\r]/;

/** A cell that a spreadsheet would run as a formula is prefixed with a quote, shown as text. */
export function neutralizeFormula(cell: string): string {
  return FORMULA_START.test(cell) ? `'${cell}` : cell;
}

/** Takes away the quote put by `neutralizeFormula`, and only that one. */
export function restoreFormula(cell: string): string {
  return NEUTRALIZED_FORMULA.test(cell) ? cell.slice(1) : cell;
}
