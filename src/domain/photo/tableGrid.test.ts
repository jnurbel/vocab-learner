import { describe, expect, it } from 'vitest';
import { NOTEBOOK_BLOCKS, NOTEBOOK_PHOTO_SIZE } from './notebookPhoto.fixtures';
import type { DetectedBlock } from './photoBlocks';
import { bandOf, centerY, inferGrid, looksLikePinyin } from './tableGrid';

/** A block printed cleanly: both models read the same text, sure of it. */
function printed(x: number, y: number, text: string, width = 200, height = 60): DetectedBlock {
  return {
    box: { x, y, width, height },
    chinese: { text, confidence: 0.98 },
    latin: { text: /\p{Script=Han}/u.test(text) ? '' : text, confidence: 0.97 },
  };
}

function table(rows: readonly (readonly string[])[], columnX: readonly number[]): DetectedBlock[] {
  return rows.flatMap((cells, row) =>
    cells.map((text, column) => printed(columnX[column] ?? 0, 100 + row * 120, text)),
  );
}

const size = { width: 1200, height: 1000 };

describe('inferGrid', () => {
  it('finds the columns of a notebook table: numbers ignored, hanzi, pinyin, then meaning', () => {
    const grid = inferGrid(NOTEBOOK_BLOCKS, NOTEBOOK_PHOTO_SIZE);

    expect(grid.columnRoles).toEqual(['ignore', 'hanzi', 'pinyin', 'meaning']);
  });

  it('puts the column separators in the blank space between the columns of the notebook', () => {
    const [numbers, hanzi, pinyin] = inferGrid(
      NOTEBOOK_BLOCKS,
      NOTEBOOK_PHOTO_SIZE,
    ).columnSeparators;

    expect(numbers).toBeGreaterThan(366);
    expect(numbers).toBeLessThan(436);
    expect(hanzi).toBeGreaterThan(842);
    expect(hanzi).toBeLessThan(943);
    expect(pinyin).toBeGreaterThan(1342);
    expect(pinyin).toBeLessThanOrEqual(1468);
  });

  it('makes one row per printed word, with a pinyin written above a word in its row', () => {
    const grid = inferGrid(NOTEBOOK_BLOCKS, NOTEBOOK_PHOTO_SIZE);
    const rowOf = (text: string) => {
      const found = NOTEBOOK_BLOCKS.find((block) => block.chinese.text === text);
      return found === undefined ? -1 : bandOf(grid.rowSeparators, centerY(found.box));
    };

    expect(grid.rowSeparators).toHaveLength(22);
    expect(rowOf('dhu')).toBe(rowOf('除了…以外'));
    expect(rowOf('ae,')).toBe(rowOf('兄弟姐妹'));
    expect(rowOf('feng ciang lpartager')).toBe(rowOf('分享'));
    expect(rowOf('7.i')).toBe(0);
  });

  it('reads an English to French list as a word column and a meaning column', () => {
    const blocks = table(
      [
        ['apple', 'pomme'],
        ['to borrow', 'emprunter'],
        ['wheel', 'roue'],
      ],
      [100, 600],
    );

    const grid = inferGrid(blocks, size);

    expect(grid.columnRoles).toEqual(['english', 'meaning']);
    expect(grid.rowSeparators).toHaveLength(2);
  });

  it('reads hanzi next to a meaning, without pinyin, as a word column and a meaning column', () => {
    const blocks = table(
      [
        ['控制', 'contrôler'],
        ['政府', 'gouvernement'],
      ],
      [100, 600],
    );

    expect(inferGrid(blocks, size).columnRoles).toEqual(['hanzi', 'meaning']);
  });

  it('keeps a list without columns, "控制 kòngzhì contrôler" per line, as a single column', () => {
    const blocks = [
      printed(50, 100, '控制 kòngzhì contrôler', 700),
      printed(50, 220, '政府 zhèngfǔ gouvernement', 760),
    ];

    const grid = inferGrid(blocks, size);

    expect(grid.columnSeparators).toEqual([]);
    expect(grid.columnRoles).toEqual(['hanzi']);
    expect(grid.rowSeparators).toEqual([190]);
  });

  it('ignores a lone column of text without any word to learn next to it', () => {
    const blocks = [printed(100, 100, 'Leçon 3'), printed(100, 300, 'Vocabulaire')];

    expect(inferGrid(blocks, size).columnRoles).toEqual(['ignore']);
  });

  it('makes a row for a word read together with its number, across the separator', () => {
    const blocks = [
      ...table(
        [
          ['1', '控制', 'contrôler'],
          ['2', '政府', 'gouvernement'],
          ['3', '家庭', 'famille'],
        ],
        [50, 300, 700],
      ),
      { ...printed(50, 460, '4 分享', 330), latin: { text: '4f', confidence: 0.7 } },
      printed(700, 460, 'partager'),
    ];

    const grid = inferGrid(blocks, size);

    expect(grid.columnRoles).toEqual(['ignore', 'hanzi', 'meaning']);
    expect(grid.rowSeparators).toHaveLength(3);
  });

  it('keeps the columns of a short table apart, even with a meaning written into the pinyin', () => {
    const blocks = [
      ...table(
        [
          ['1', '控制', 'kong zhi', 'contrôler'],
          ['2', '政府'],
          ['3', '家庭', 'jia ting', 'famille'],
        ],
        [20, 250, 500, 800],
      ),
      printed(500, 220, 'zhen fu gouvernement', 520),
    ];

    expect(inferGrid(blocks, size).columnRoles).toEqual(['ignore', 'hanzi', 'pinyin', 'meaning']);
  });

  it('keeps one row for a word printed in two pieces on the same line', () => {
    const blocks = [printed(100, 100, '除了', 90), printed(200, 104, '以外', 90)];

    expect(inferGrid(blocks, size).rowSeparators).toEqual([]);
  });

  it('finds nothing to cut on a photo without text', () => {
    const grid = inferGrid([], size);

    expect(grid).toEqual({
      size,
      columnSeparators: [],
      columnRoles: ['ignore'],
      rowSeparators: [],
    });
  });
});

describe('looksLikePinyin', () => {
  it.each(['kòngzhì', 'kong zhi', 'zisi', 'xin gu'])('reads %s as pinyin', (text) => {
    expect(looksLikePinyin(text)).toBe(true);
  });

  it('answers at once on a long hostile text, without catastrophic backtracking', () => {
    const start = performance.now();

    expect(looksLikePinyin(`${'aoaoaoaoao'.repeat(2000)}!`)).toBe(false);
    expect(performance.now() - start).toBeLessThan(200);
  });

  it.each(['gouvernement', 'chouchouter', '', '12'])('does not read %s as pinyin', (text) => {
    expect(looksLikePinyin(text)).toBe(false);
  });
});
