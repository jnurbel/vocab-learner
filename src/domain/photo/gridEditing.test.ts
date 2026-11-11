import { describe, expect, it } from 'vitest';
import {
  addSeparator,
  MIN_BAND,
  moveSeparator,
  removeSeparator,
  setColumnRole,
} from './gridEditing';
import type { Grid } from './tableGrid';

const grid: Grid = {
  size: { width: 1000, height: 600 },
  columnSeparators: [100, 400],
  columnRoles: ['ignore', 'hanzi', 'meaning'],
  rowSeparators: [200, 400],
};

describe('moveSeparator', () => {
  it('moves a column separator', () => {
    expect(moveSeparator(grid, 'column', 1, 450).columnSeparators).toEqual([100, 450]);
  });

  it('moves a row separator, rounded to the pixel', () => {
    expect(moveSeparator(grid, 'row', 0, 250.6).rowSeparators).toEqual([251, 400]);
  });

  it('keeps a separator between its neighbours, so that no band is emptied', () => {
    expect(moveSeparator(grid, 'column', 1, 50).columnSeparators).toEqual([100, 100 + MIN_BAND]);
    expect(moveSeparator(grid, 'column', 1, 5000).columnSeparators).toEqual([100, 1000 - MIN_BAND]);
    expect(moveSeparator(grid, 'row', 0, -20).rowSeparators).toEqual([MIN_BAND, 400]);
  });

  it('ignores a separator that does not exist', () => {
    expect(moveSeparator(grid, 'row', 5, 300)).toEqual(grid);
    expect(moveSeparator(grid, 'row', 0, Number.NaN)).toEqual(grid);
  });
});

describe('addSeparator', () => {
  it('cuts a column in two, both keeping its role until the learner changes one', () => {
    const added = addSeparator(grid, 'column', 700);

    expect(added.columnSeparators).toEqual([100, 400, 700]);
    expect(added.columnRoles).toEqual(['ignore', 'hanzi', 'meaning', 'meaning']);
  });

  it('adds a row separator in its place', () => {
    expect(addSeparator(grid, 'row', 300).rowSeparators).toEqual([200, 300, 400]);
  });

  it('adds nothing too close to another separator or to the edge', () => {
    expect(addSeparator(grid, 'row', 205)).toEqual(grid);
    expect(addSeparator(grid, 'column', 3)).toEqual(grid);
    expect(addSeparator(grid, 'column', Number.POSITIVE_INFINITY)).toEqual(grid);
  });
});

describe('removeSeparator', () => {
  it('joins two columns, keeping the role of the left one', () => {
    const removed = removeSeparator(grid, 'column', 1);

    expect(removed.columnSeparators).toEqual([100]);
    expect(removed.columnRoles).toEqual(['ignore', 'hanzi']);
  });

  it('keeps the role of the right column when the left one was ignored', () => {
    expect(removeSeparator(grid, 'column', 0).columnRoles).toEqual(['hanzi', 'meaning']);
  });

  it('keeps two ignored columns joined ignored', () => {
    const ignored = setColumnRole(grid, 1, 'ignore');

    expect(removeSeparator(ignored, 'column', 0).columnRoles).toEqual(['ignore', 'meaning']);
  });

  it('joins two rows', () => {
    expect(removeSeparator(grid, 'row', 0).rowSeparators).toEqual([400]);
  });

  it('ignores a separator that does not exist', () => {
    expect(removeSeparator(grid, 'column', 9)).toEqual(grid);
  });
});

describe('setColumnRole', () => {
  it('marks the column of the row numbers to ignore, or any column with its content', () => {
    expect(setColumnRole(grid, 0, 'pinyin').columnRoles).toEqual(['pinyin', 'hanzi', 'meaning']);
  });

  it('ignores a column that does not exist', () => {
    expect(setColumnRole(grid, 3, 'pinyin')).toEqual(grid);
  });
});
