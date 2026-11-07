import { describe, expect, it } from 'vitest';
import { ECONOMY_CONFIG } from './economyConfig';
import { levelFor, levelProgress, xpForLevel } from './level';

/** The table of GAME_DESIGN.md 4.3: level, total XP needed to reach it. */
const LEVEL_TABLE: readonly [number, number][] = [
  [1, 0],
  [2, 100],
  [3, 250],
  [4, 450],
  [5, 700],
  [6, 1000],
  [7, 1350],
  [8, 1750],
  [9, 2200],
  [10, 2700],
  [11, 3250],
  [12, 3850],
  [13, 4500],
  [14, 5200],
  [15, 5950],
  [16, 6750],
  [17, 7600],
  [18, 8500],
  [19, 9450],
  [20, 10450],
];

describe('the levels (GAME_DESIGN.md 4.3)', () => {
  it.each(LEVEL_TABLE)('reaches level %i at %i XP in total', (level, total) => {
    expect(xpForLevel(level, ECONOMY_CONFIG)).toBe(total);
    expect(levelFor(total, ECONOMY_CONFIG)).toBe(level);
  });

  it.each(LEVEL_TABLE.slice(1))('stays one level lower just before level %i', (level, total) => {
    expect(levelFor(total - 1, ECONOMY_CONFIG)).toBe(level - 1);
  });

  it('has no highest level', () => {
    expect(levelFor(1_000_000, ECONOMY_CONFIG)).toBeGreaterThan(100);
  });

  it('treats a negative or invalid total as level 1', () => {
    expect(levelFor(-50, ECONOMY_CONFIG)).toBe(1);
    expect(levelFor(Number.NaN, ECONOMY_CONFIG)).toBe(1);
  });

  it('tells how far the next level is', () => {
    expect(levelProgress(1230, ECONOMY_CONFIG)).toEqual({
      level: 6,
      levelStartXp: 1000,
      nextLevelXp: 1350,
      xpToNext: 120,
    });
  });

  it('counts a whole level still to go right after a level up', () => {
    expect(levelProgress(100, ECONOMY_CONFIG)).toMatchObject({ level: 2, xpToNext: 150 });
  });
});
