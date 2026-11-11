import type { ImageSize } from './imageSize';
import type { Box, DetectedBlock } from './photoBlocks';

/** What a column of the photo holds, chosen by the learner or guessed from what was read. */
export type ColumnRole = 'hanzi' | 'english' | 'pinyin' | 'meaning' | 'ignore';

export const COLUMN_ROLES: readonly ColumnRole[] = [
  'hanzi',
  'english',
  'pinyin',
  'meaning',
  'ignore',
];

/**
 * How the photo is cut into cells: vertical separators between columns, each column with its
 * role, and horizontal separators between rows. Positions are in pixels of the photo, sorted.
 */
export interface Grid {
  size: ImageSize;
  columnSeparators: number[];
  /** One more than the column separators. */
  columnRoles: ColumnRole[];
  rowSeparators: number[];
}

/** Below this, a block is noise: a smudge or a line of the table read as a letter. */
const MIN_BLOCK_CONFIDENCE = 0.3;
/** A column is where more than this share of the busiest column's blocks stand. */
const COLUMN_DENSITY = 0.25;
const HAN = /\p{Script=Han}/u;
const ROW_NUMBER = /^\(?\d{1,3}[.)]?$/;
const TONE_MARK = /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/;
/** One pinyin syllable, without its tone: matched alone, never repeated, so it cannot backtrack. */
const PINYIN_SYLLABLE =
  /^(?:er|(?:zh|ch|sh|[bpmfdtnlgkhjqxrzcsyw])?(?:iang|iong|uang|ang|eng|ing|ong|uai|uan|ian|iao|ai|ei|ao|ou|an|en|in|un|ua|uo|ia|ie|iu|ui|ue|a|o|e|i|u|v|ü))$/;
const LONGEST_SYLLABLE = 6;
/** A column whose blocks read as pinyin this often is the pinyin column. */
const PINYIN_SHARE = 0.5;

/** Whether a block was read with enough confidence by at least one model to be text. */
export function isText({ chinese, latin }: DetectedBlock): boolean {
  return (
    (chinese.text.trim() !== '' && chinese.confidence >= MIN_BLOCK_CONFIDENCE) ||
    (latin.text.trim() !== '' && latin.confidence >= MIN_BLOCK_CONFIDENCE)
  );
}

export function hasHan(text: string): boolean {
  return HAN.test(text);
}

/** Whether a text reads as pinyin: tone marks, or letters made only of pinyin syllables. */
export function looksLikePinyin(text: string): boolean {
  if (TONE_MARK.test(text)) {
    return true;
  }
  const words = text
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word !== '');
  return words.length > 0 && words.every(isSyllables);
}

/** Whether a word splits into pinyin syllables, found in linear time. */
function isSyllables(word: string): boolean {
  const reachable = [true];
  for (let end = 1; end <= word.length; end += 1) {
    reachable.push(
      Array.from({ length: Math.min(LONGEST_SYLLABLE, end) }, (_, index) => end - index - 1).some(
        (start) => reachable[start] === true && PINYIN_SYLLABLE.test(word.slice(start, end)),
      ),
    );
  }
  return reachable.at(-1) === true;
}

export function centerX(box: Box): number {
  return box.x + box.width / 2;
}

export function centerY(box: Box): number {
  return box.y + box.height / 2;
}

/** The index of the band, between sorted separators, that holds a position. */
export function bandOf(separators: readonly number[], position: number): number {
  const index = separators.findIndex((separator) => position < separator);
  return index === -1 ? separators.length : index;
}

/** How many blocks cover each column of pixels of the photo. */
function coverage(blocks: readonly DetectedBlock[], width: number): number[] {
  return Array.from(
    { length: width + 1 },
    (_, x) => blocks.filter(({ box }) => box.x <= x && x < box.x + box.width).length,
  );
}

/** The middle of the emptiest stretch between two busy columns. */
function quietestPoint(counts: readonly number[], start: number, end: number): number {
  let lowest = Infinity;
  let runStart = start;
  let best = { start, end };
  for (const [offset, count] of counts.slice(start, end + 1).entries()) {
    const x = start + offset;
    if (count < lowest) {
      lowest = count;
      runStart = x;
      best = { start: x, end: x };
    } else if (count === lowest && runStart === best.start && x === best.end + 1) {
      best = { start: runStart, end: x };
    }
  }
  return Math.round((best.start + best.end) / 2);
}

/** Vertical separators at the quietest place between the busy stretches of the photo. */
function findColumnSeparators(blocks: readonly DetectedBlock[], width: number): number[] {
  const counts = coverage(blocks, width);
  const threshold = Math.max(0, ...counts) * COLUMN_DENSITY;
  const separators: number[] = [];
  let previousEnd: number | undefined;
  counts.forEach((count, x) => {
    if (count <= threshold) {
      return;
    }
    if (previousEnd !== undefined && previousEnd < x - 1) {
      separators.push(quietestPoint(counts, previousEnd + 1, x - 1));
    }
    previousEnd = x;
  });
  return separators;
}

function share(blocks: readonly DetectedBlock[], test: (block: DetectedBlock) => boolean): number {
  return blocks.filter(test).length / Math.max(1, blocks.length);
}

function isRowNumber({ chinese, latin }: DetectedBlock): boolean {
  return ROW_NUMBER.test(chinese.text.trim()) || ROW_NUMBER.test(latin.text.trim());
}

/** Guesses each column's role from what its blocks read. */
function guessRoles(columns: readonly DetectedBlock[][]): ColumnRole[] {
  const roles = columns.map((blocks): ColumnRole | undefined => {
    if (blocks.length === 0 || share(blocks, isRowNumber) > 0.5) {
      return 'ignore';
    }
    return share(blocks, (block) => hasHan(block.chinese.text)) >= 0.5 ? 'hanzi' : undefined;
  });
  const textColumns = roles.flatMap((role, index) => (role === undefined ? [index] : []));
  const hasHanzi = roles.includes('hanzi');
  const pinyinScores = columns
    .filter((_, index) => roles[index] === undefined)
    .map((blocks) => share(blocks, (block) => looksLikePinyin(block.latin.text)));
  const bestPinyin = Math.max(0, ...pinyinScores);
  const pinyinColumn =
    hasHanzi && bestPinyin >= PINYIN_SHARE
      ? textColumns[pinyinScores.indexOf(bestPinyin)]
      : undefined;
  const meaningColumn = textColumns.filter((index) => index !== pinyinColumn).at(-1);
  const englishColumn = hasHanzi ? undefined : textColumns.find((index) => index !== meaningColumn);
  return roles.map((role, index) => {
    if (role !== undefined) {
      return role;
    }
    if (index === pinyinColumn) {
      return 'pinyin';
    }
    if (index === englishColumn) {
      return 'english';
    }
    return index === meaningColumn && (hasHanzi || englishColumn !== undefined)
      ? 'meaning'
      : 'ignore';
  });
}

/** Blocks on the same line overlap by at least this share of the shorter one's height. */
const SAME_LINE_OVERLAP = 0.5;

function verticalOverlap(first: Box, second: Box): number {
  const overlap =
    Math.min(first.y + first.height, second.y + second.height) - Math.max(first.y, second.y);
  return Math.max(0, overlap) / Math.min(first.height, second.height);
}

/**
 * One row per word: the words of the word column (a hanzi column only counts its hanzi, not the
 * pinyin written above them) give the rows, cut halfway between two words.
 */
function findRowSeparators(words: readonly DetectedBlock[]): number[] {
  const lines: Box[] = [];
  for (const { box } of [...words].sort((first, second) => first.box.y - second.box.y)) {
    const last = lines.at(-1);
    if (last !== undefined && verticalOverlap(last, box) >= SAME_LINE_OVERLAP) {
      const bottom = Math.max(last.y + last.height, box.y + box.height);
      last.y = Math.min(last.y, box.y);
      last.height = bottom - last.y;
    } else {
      lines.push({ ...box });
    }
  }
  return lines.length === 0 ? [] : midpoints(lines.map(centerY));
}

/** The positions halfway between consecutive sorted positions. */
export function midpoints(positions: readonly number[]): number[] {
  const halfways: number[] = [];
  positions.reduce((previous, position) => {
    halfways.push(Math.round((previous + position) / 2));
    return position;
  });
  return halfways;
}

/** A block stands in the word column when at least this share of its width is in it. */
const WORD_SHARE = 0.25;

/** The edges of the bands between sorted separators, from 0 to the size. */
export function bands(
  separators: readonly number[],
  size: number,
): { start: number; end: number }[] {
  let start = 0;
  return [...separators, size].map((end) => {
    const band = { start, end };
    start = end;
    return band;
  });
}

function isWordOf(role: ColumnRole, block: DetectedBlock): boolean {
  return role === 'hanzi' ? hasHan(block.chinese.text) : role === 'english';
}

/**
 * Guesses how a photo of a vocabulary list is cut into cells, from the blocks of text found on it:
 * the columns where blocks pile up, what each holds, and one row per word.
 */
export function inferGrid(blocks: readonly DetectedBlock[], size: ImageSize): Grid {
  const text = blocks.filter(isText);
  const columnSeparators = findColumnSeparators(text, size.width);
  const columns = Array.from({ length: columnSeparators.length + 1 }, () => [] as DetectedBlock[]);
  for (const block of text) {
    columns[bandOf(columnSeparators, centerX(block.box))]?.push(block);
  }
  const columnRoles = guessRoles(columns);
  // A word read together with its number, over the separator, still makes its row.
  const wordColumns = bands(columnSeparators, size.width).filter((_, index) =>
    columnRoles.slice(index, index + 1).some((role) => role === 'hanzi' || role === 'english'),
  );
  const role = columnRoles.includes('hanzi') ? 'hanzi' : 'english';
  const words = text.filter(
    (block) =>
      isWordOf(role, block) &&
      wordColumns.some(({ start, end }) => {
        const shared = Math.min(end, block.box.x + block.box.width) - Math.max(start, block.box.x);
        return shared >= block.box.width * WORD_SHARE;
      }),
  );
  return {
    size: { width: size.width, height: size.height },
    columnSeparators,
    columnRoles,
    rowSeparators: findRowSeparators(words),
  };
}
