import { describe, expect, it } from 'vitest';
import { NOTEBOOK_BLOCKS, NOTEBOOK_PHOTO_SIZE, NOTEBOOK_TERMS } from './notebookPhoto.fixtures';
import type { DetectedBlock } from './photoBlocks';
import { cutIntoPieces, fillTable, type BlockPiece } from './photoTable';
import { inferGrid, type Grid } from './tableGrid';

function printed(x: number, y: number, text: string, width = 200): DetectedBlock {
  return {
    box: { x, y, width, height: 60 },
    chinese: { text, confidence: 0.98 },
    latin: { text: /\p{Script=Han}/u.test(text) ? '' : text, confidence: 0.97 },
  };
}

const notebookGrid = inferGrid(NOTEBOOK_BLOCKS, NOTEBOOK_PHOTO_SIZE);

/** The pieces cut by a separator, read again by the model of their column (here, a fake one). */
function readAll(pieces: readonly BlockPiece[], read: (piece: BlockPiece) => string) {
  return pieces.map((piece) =>
    piece.reading === undefined
      ? { ...piece, reading: { text: read(piece), confidence: 0.9 } }
      : piece,
  );
}

describe('cutIntoPieces', () => {
  it('reads a block of the hanzi column with the Chinese model, of the meaning with the Latin one', () => {
    const pieces = cutIntoPieces(notebookGrid, NOTEBOOK_BLOCKS);
    const textOf = (x: number, y: number) =>
      pieces.find(({ box }) => box.x === x && box.y === y)?.reading?.text;

    expect(textOf(508, 197)).toBe('控制');
    expect(textOf(1468, 82)).toBe('enfantunique');
  });

  it('cuts a block written across a separator in two pieces, each to read with its column', () => {
    const pieces = cutIntoPieces(notebookGrid, NOTEBOOK_BLOCKS);
    const separator = notebookGrid.columnSeparators[2] ?? 0;

    const cut = pieces.filter(({ reading }) => reading === undefined);

    expect(cut).toEqual([
      expect.objectContaining({
        column: 2,
        script: 'latin',
        box: { x: 946, y: 3090, width: separator - 946, height: 116 },
      }),
      expect.objectContaining({
        column: 3,
        script: 'latin',
        box: { x: separator, y: 3090, width: 1886 - separator, height: 116 },
      }),
    ]);
  });

  it('leaves out the noise and the blocks of an ignored column', () => {
    const pieces = cutIntoPieces(notebookGrid, NOTEBOOK_BLOCKS);

    expect(pieces.some(({ box }) => box.x === 1456 && box.y === 630)).toBe(false);
    expect(pieces.some(({ column }) => column === 0)).toBe(false);
  });
});

describe('fillTable', () => {
  const rows = fillTable(
    notebookGrid,
    readAll(cutIntoPieces(notebookGrid, NOTEBOOK_BLOCKS), ({ column }) =>
      column === 2 ? 'feng xiang' : 'partager',
    ),
  );

  it('gives the printed word of each of the 23 rows of the notebook', () => {
    expect(rows.map(({ term }) => term.text)).toEqual(NOTEBOOK_TERMS);
  });

  it('keeps the pinyin written in the notebook and the meaning as read, for each row', () => {
    expect(rows[1]).toEqual(
      expect.objectContaining({
        notebookPinyin: 'kong shi',
        meaning: { text: 'controlercontrgle', confidence: 0.83 },
      }),
    );
    expect([rows[22]?.notebookPinyin, rows[22]?.meaning.text]).toEqual(['feng xiang', 'partager']);
  });

  it('drops a scribble above a word when it does not surely read as pinyin', () => {
    expect(rows[8]?.notebookPinyin).toBe('');
    expect(rows[17]?.notebookPinyin).toBe('');
  });

  it('keeps a pinyin clearly written above a word, and drops a smudge next to a meaning', () => {
    const grid: Grid = {
      size: { width: 1000, height: 400 },
      columnSeparators: [500],
      columnRoles: ['hanzi', 'meaning'],
      rowSeparators: [],
    };
    const blocks = [
      printed(50, 30, 'kòngzhì'),
      printed(50, 100, '控制'),
      printed(600, 100, 'contrôler', 300),
      { ...printed(950, 110, 'z', 20), latin: { text: 'z', confidence: 0.55 } },
    ];

    const [row] = fillTable(grid, cutIntoPieces(grid, blocks));

    expect(row?.notebookPinyin).toBe('kòngzhì');
    expect(row?.meaning.text).toBe('contrôler');
  });

  it('gives each row its band of the photo, the whole width of the page, for a thumbnail', () => {
    expect(rows[0]?.box).toEqual({
      x: 0,
      y: 0,
      width: 2464,
      height: notebookGrid.rowSeparators[0],
    });
  });

  it('splits a line "控制 kòngzhì contrôler" of a list without columns', () => {
    const blocks = [
      printed(50, 100, '控制 kòngzhì contrôler', 700),
      printed(50, 220, '政府 gouvernement', 700),
    ];
    const grid = inferGrid(blocks, { width: 1000, height: 400 });

    const [first, second] = fillTable(grid, cutIntoPieces(grid, blocks));

    expect([first?.term.text, first?.notebookPinyin, first?.meaning.text]).toEqual([
      '控制',
      'kòngzhì',
      'contrôler',
    ]);
    expect([second?.term.text, second?.notebookPinyin, second?.meaning.text]).toEqual([
      '政府',
      '',
      'gouvernement',
    ]);
  });

  it('keeps a line with a word and its pinyin only, its meaning left to type', () => {
    const grid: Grid = {
      size: { width: 1000, height: 200 },
      columnSeparators: [],
      columnRoles: ['hanzi'],
      rowSeparators: [],
    };

    const [row] = fillTable(grid, cutIntoPieces(grid, [printed(50, 50, '控制 kòng zhì', 500)]));

    expect([row?.term.text, row?.notebookPinyin, row?.meaning.text]).toEqual([
      '控制',
      'kòng zhì',
      '',
    ]);
  });

  it('reads an English to French list', () => {
    const blocks = [
      printed(50, 100, 'to borrow'),
      printed(600, 100, 'emprunter'),
      printed(50, 220, 'wheel'),
      printed(600, 220, 'roue'),
    ];
    const grid = inferGrid(blocks, { width: 1000, height: 400 });

    const table = fillTable(grid, cutIntoPieces(grid, blocks));

    expect(table.map(({ term, meaning }) => [term.text, meaning.text])).toEqual([
      ['to borrow', 'emprunter'],
      ['wheel', 'roue'],
    ]);
  });

  it('splits an English list without columns at its dash: "apple - pomme"', () => {
    const grid: Grid = {
      size: { width: 1000, height: 200 },
      columnSeparators: [],
      columnRoles: ['english'],
      rowSeparators: [],
    };

    const [row] = fillTable(grid, cutIntoPieces(grid, [printed(50, 50, 'apple - pomme')]));

    expect([row?.term.text, row?.meaning.text]).toEqual(['apple', 'pomme']);
  });

  it('reads again the two halves of a word and its meaning written as one block', () => {
    const grid: Grid = {
      size: { width: 1000, height: 400 },
      columnSeparators: [500],
      columnRoles: ['hanzi', 'meaning'],
      rowSeparators: [],
    };
    const pieces = cutIntoPieces(grid, [printed(100, 100, '控制 cont', 800)]);

    const [row] = fillTable(
      grid,
      readAll(pieces, ({ script }) => (script === 'chinese' ? '1. 控制' : 'contrôler')),
    );

    expect([row?.term.text, row?.meaning.text]).toEqual(['控制', 'contrôler']);
  });

  it('leaves a cell empty while its piece is not read again', () => {
    const grid: Grid = {
      size: { width: 1000, height: 400 },
      columnSeparators: [500],
      columnRoles: ['hanzi', 'meaning'],
      rowSeparators: [],
    };
    const pieces = cutIntoPieces(grid, [printed(100, 100, '控制 cont', 800)]);

    expect(fillTable(grid, pieces)).toEqual([]);
  });

  it('ignores a column given no role, as in a grid edited out of shape', () => {
    const grid: Grid = {
      size: { width: 1000, height: 400 },
      columnSeparators: [500],
      columnRoles: ['hanzi'],
      rowSeparators: [],
    };

    const table = fillTable(
      grid,
      cutIntoPieces(grid, [printed(50, 100, '控制'), printed(600, 100, 'contrôler')]),
    );

    expect(table.map(({ term, meaning }) => [term.text, meaning.text])).toEqual([['控制', '']]);
  });

  it('drops a row without a word nor a meaning', () => {
    const grid: Grid = {
      size: { width: 1000, height: 400 },
      columnSeparators: [500],
      columnRoles: ['hanzi', 'meaning'],
      rowSeparators: [200],
    };

    const table = fillTable(
      grid,
      cutIntoPieces(grid, [printed(50, 250, '控制'), printed(600, 250, 'contrôler')]),
    );

    expect(table).toHaveLength(1);
    expect(table[0]?.row).toBe(1);
  });
});
