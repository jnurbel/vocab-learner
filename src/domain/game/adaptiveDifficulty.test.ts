import { describe, expect, it } from 'vitest';
import type { GameLevel } from '../progressRecords';
import {
  difficultyFor,
  gameLevelKey,
  initialGameLevel,
  recordGameAnswer,
} from './adaptiveDifficulty';
import { MINI_GAME_CONFIG as ADAPTIVE_CONFIG } from './miniGameConfig';

function answers(start: GameLevel, results: readonly boolean[]): GameLevel {
  return results.reduce(
    (level, correct) => recordGameAnswer(level, correct, ADAPTIVE_CONFIG),
    start,
  );
}

const repeat = (correct: boolean, times: number) => Array.from({ length: times }, () => correct);

describe('the adaptive difficulty of a mini-game (GAME_DESIGN.md 6.0)', () => {
  it('keeps one level per game and language', () => {
    expect(gameLevelKey('listenMeaning', 'zh')).toBe('listenMeaning:zh');
  });

  it('starts at level 2, for an advanced audience', () => {
    expect(initialGameLevel(ADAPTIVE_CONFIG)).toEqual({ level: 2, window: [] });
  });

  it('goes up a level after at least 7 right answers out of the last 8, and clears the window', () => {
    const level = answers(initialGameLevel(ADAPTIVE_CONFIG), [...repeat(true, 7), false]);

    expect(level).toEqual({ level: 3, window: [] });
  });

  it('goes down a level after at most 5 right answers out of the last 8', () => {
    const level = answers(initialGameLevel(ADAPTIVE_CONFIG), [
      ...repeat(true, 5),
      ...repeat(false, 3),
    ]);

    expect(level).toEqual({ level: 1, window: [] });
  });

  it('stays at its level with 6 right answers out of 8, sliding the window', () => {
    const level = answers(initialGameLevel(ADAPTIVE_CONFIG), [
      ...repeat(true, 6),
      false,
      false,
      true,
    ]);

    expect(level.level).toBe(2);
    expect(level.window).toHaveLength(8);
  });

  it('waits for 8 answers before changing anything', () => {
    const level = answers(initialGameLevel(ADAPTIVE_CONFIG), repeat(false, 7));

    expect(level).toEqual({ level: 2, window: repeat(false, 7) });
  });

  it('never goes above level 3 nor below level 1', () => {
    expect(answers({ level: 3, window: [] }, repeat(true, 8)).level).toBe(3);
    expect(answers({ level: 1, window: [] }, repeat(false, 8)).level).toBe(1);
  });

  it('changes level silently: no window is kept longer than 8 answers', () => {
    const tooLong: GameLevel = { level: 2, window: repeat(true, 20).map((_, i) => i % 3 !== 0) };

    expect(recordGameAnswer(tooLong, true, ADAPTIVE_CONFIG).window.length).toBeLessThanOrEqual(8);
  });

  it('caps a word at the sprout stage to level 2', () => {
    expect(difficultyFor(3, 'sprout', ADAPTIVE_CONFIG)).toBe(2);
    expect(difficultyFor(3, 'stem', ADAPTIVE_CONFIG)).toBe(3);
    expect(difficultyFor(1, 'sprout', ADAPTIVE_CONFIG)).toBe(1);
  });

  it('asks a word never reviewed at level 1, like the check right after a discovery', () => {
    expect(difficultyFor(3, 'seed', ADAPTIVE_CONFIG)).toBe(1);
  });
});
