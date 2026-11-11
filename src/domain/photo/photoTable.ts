import type { Box, DetectedBlock, Reading, Script } from './photoBlocks';
import {
  bandOf,
  bands,
  centerX,
  centerY,
  hasHan,
  isText,
  looksLikePinyin,
  type ColumnRole,
  type Grid,
} from './tableGrid';

/**
 * A block, or the part of it within one column. A block written across a column separator is cut
 * in pieces that have no reading yet: each is to be read again by the model of its column.
 */
export interface BlockPiece {
  box: Box;
  row: number;
  column: number;
  script: Script;
  reading?: Reading;
  /** What the other model read in the whole block: the Latin reading of a pinyin above hanzi. */
  alternative?: Reading;
}

/** A cell of the table as read: its text, and how sure the reading is (0 to 1). */
export interface CellText {
  text: string;
  confidence: number;
}

/** A word of the photographed list, before the learner checks it. */
export interface PhotoRow {
  /** The row of the grid, from the top. */
  row: number;
  /** The band of the photo where the row stands, the whole width of the page. */
  box: Box;
  term: CellText;
  /** The pinyin written on the sheet, if any: a hint for the learner, never the saved pinyin. */
  notebookPinyin: string;
  meaning: CellText;
}

/** A piece narrower than this share of its block is a stray stroke over the separator. */
const MIN_PIECE_SHARE = 0.25;
/** Below this, a pinyin read on the sheet is not worth showing. */
const MIN_PINYIN_CONFIDENCE = 0.6;
/** In a cell, a piece this much narrower than the widest one, of one or two characters, is noise. */
const SMUDGE_SHARE = 0.2;
const SMUDGE_LENGTH = 2;
const LEADING_NON_HAN = /^[^\p{Script=Han}]+/u;
const TERM_CHARACTER = /[\p{Script=Han}…·、，（）()]/u;
const ENGLISH_SEPARATOR = /\s+[-–—:=]\s+|\s*\|\s*|\t/;
const NOT_PINYIN_LETTER = /[^\p{L}\s]/gu;

export function scriptOf(role: ColumnRole): Script {
  return role === 'hanzi' ? 'chinese' : 'latin';
}

function roleOf(grid: Grid, column: number): ColumnRole {
  return grid.columnRoles[column] ?? 'ignore';
}

/**
 * Puts each block of text in its cell. A block within one column takes the reading of that
 * column's model; a block across a separator is cut, and its pieces are left to read again.
 */
export function cutIntoPieces(grid: Grid, blocks: readonly DetectedBlock[]): BlockPiece[] {
  const columns = bands(grid.columnSeparators, grid.size.width);
  return blocks.filter(isText).flatMap((block): BlockPiece[] => {
    const { box } = block;
    const row = bandOf(grid.rowSeparators, centerY(box));
    const parts = columns
      .map(({ start, end }, column) => {
        const left = Math.max(start, box.x);
        return { column, left, width: Math.min(end, box.x + box.width) - left };
      })
      .filter(({ width }) => width >= box.width * MIN_PIECE_SHARE);
    if (parts.length <= 1) {
      const column = bandOf(grid.columnSeparators, centerX(box));
      const role = roleOf(grid, column);
      const script = scriptOf(role);
      const reading = block[script];
      const alternative = script === 'chinese' ? block.latin : block.chinese;
      return role === 'ignore' ? [] : [{ box, row, column, script, reading, alternative }];
    }
    return parts
      .filter(({ column }) => roleOf(grid, column) !== 'ignore')
      .map(({ column, left, width }) => ({
        box: { x: left, y: box.y, width, height: box.height },
        row,
        column,
        script: scriptOf(roleOf(grid, column)),
      }));
  });
}

function readingOf(piece: BlockPiece): Reading {
  return piece.reading ?? { text: '', confidence: 0 };
}

/** Drops the stray strokes read next to the real text of a cell. */
function withoutSmudges(pieces: readonly BlockPiece[]): BlockPiece[] {
  const widest = Math.max(0, ...pieces.map(({ box }) => box.width));
  return pieces.filter(
    (piece) =>
      piece.box.width >= widest * SMUDGE_SHARE ||
      readingOf(piece).text.trim().length > SMUDGE_LENGTH,
  );
}

function joinCell(pieces: readonly BlockPiece[], separator: string): CellText {
  const readings = pieces.map(readingOf).filter(({ text }) => text.trim() !== '');
  return {
    text: readings.map(({ text }) => text.trim()).join(separator),
    confidence: Math.min(1, ...readings.map(({ confidence }) => confidence)),
  };
}

function cleanPinyin(text: string): string {
  return text.replace(NOT_PINYIN_LETTER, ' ').replace(/\s+/g, ' ').trim();
}

/** The leading words that read as pinyin, then the rest. */
function splitPinyin(text: string): { pinyin: string; rest: string } {
  const words = text.split(/\s+/).filter((word) => word !== '');
  const count = words.findIndex((word) => !looksLikePinyin(word));
  const end = count === -1 ? words.length : count;
  return { pinyin: words.slice(0, end).join(' '), rest: words.slice(end).join(' ') };
}

interface RowCells {
  term: CellText;
  pinyin: string[];
  meaning: string[];
}

function hanziCell(pieces: readonly BlockPiece[]): RowCells {
  const words = pieces.filter((piece) => hasHan(readingOf(piece).text));
  const pinyin = pieces
    .filter((piece) => !hasHan(readingOf(piece).text))
    .map((piece) => piece.alternative ?? readingOf(piece))
    .filter(
      ({ text, confidence }) =>
        confidence >= MIN_PINYIN_CONFIDENCE && looksLikePinyin(cleanPinyin(text)),
    )
    .map(({ text }) => cleanPinyin(text));
  const read = joinCell(words, '');
  // A line of a list without columns: the word, then its pinyin and meaning ("控制 kòngzhì …").
  const characters = Array.from(read.text.replace(LEADING_NON_HAN, ''));
  const cut = characters.findIndex((character) => !TERM_CHARACTER.test(character));
  if (cut === -1) {
    return { term: { ...read, text: characters.join('') }, pinyin, meaning: [] };
  }
  const split = splitPinyin(characters.slice(cut).join('').trim());
  return {
    term: { ...read, text: characters.slice(0, cut).join('') },
    pinyin: [...pinyin, split.pinyin],
    meaning: [split.rest],
  };
}

function englishCell(pieces: readonly BlockPiece[]): RowCells {
  const term = joinCell(pieces, ' ');
  const [word = '', ...meaning] = term.text.split(ENGLISH_SEPARATOR);
  return { term: { ...term, text: word.trim() }, pinyin: [], meaning: [meaning.join(' ')] };
}

/** Builds one word per row of the grid from the pieces read in its cells. */
export function fillTable(grid: Grid, pieces: readonly BlockPiece[]): PhotoRow[] {
  const ordered = [...pieces].sort(
    (first, second) => first.box.y - second.box.y || first.box.x - second.box.x,
  );
  const hasHanzi = grid.columnRoles.includes('hanzi');
  return bands(grid.rowSeparators, grid.size.height).flatMap(({ start, end }, row): PhotoRow[] => {
    const inRow = ordered.filter((piece) => piece.row === row);
    const ofRole = (role: ColumnRole) =>
      withoutSmudges(inRow.filter(({ column }) => roleOf(grid, column) === role));
    const cells = hasHanzi ? hanziCell(ofRole('hanzi')) : englishCell(ofRole('english'));
    const pinyin = ofRole('pinyin')
      .map(readingOf)
      .filter(({ confidence }) => confidence >= MIN_PINYIN_CONFIDENCE)
      .map(({ text }) => cleanPinyin(text));
    const meaningCell = joinCell(ofRole('meaning'), ' ');
    const meaningText = [...cells.meaning, meaningCell.text].filter((text) => text !== '');
    if (cells.term.text === '' && meaningText.length === 0) {
      return [];
    }
    return [
      {
        row,
        box: { x: 0, y: start, width: grid.size.width, height: end - start },
        term: cells.term,
        notebookPinyin: [...cells.pinyin, ...pinyin].filter((text) => text !== '').join(' '),
        meaning: {
          text: meaningText.join(' '),
          confidence: meaningCell.text === '' ? cells.term.confidence : meaningCell.confidence,
        },
      },
    ];
  });
}
