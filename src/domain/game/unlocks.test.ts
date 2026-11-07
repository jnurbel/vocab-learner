import { describe, expect, it } from 'vitest';
import { ECONOMY_CONFIG } from './economyConfig';
import { achievementsOf, nextLevelUnlocks, unlocksBetweenLevels } from './unlocks';

describe('the unlocks of the levels (GAME_DESIGN.md 4.5)', () => {
  it.each([
    [2, ['pier']],
    [6, ['pond']],
    [9, ['rowboat']],
    [10, ['pavilion', 'paletteWinter']],
    [20, ['paletteDawn', 'secondIslet']],
  ])('unlocks at level %i: %j', (level, ids) => {
    expect(unlocksBetweenLevels(level - 1, level, ECONOMY_CONFIG)).toEqual(ids);
  });

  it('unlocks a decoration at every level from 2 to 20 but 11, 20 in all', () => {
    expect(unlocksBetweenLevels(1, 20, ECONOMY_CONFIG)).toHaveLength(20);
  });

  it('unlocks every level crossed at once, in order', () => {
    expect(unlocksBetweenLevels(1, 3, ECONOMY_CONFIG)).toEqual(['pier', 'pathLamps']);
  });

  it('unlocks nothing when the level does not grow', () => {
    expect(unlocksBetweenLevels(5, 5, ECONOMY_CONFIG)).toEqual([]);
  });

  it('announces the next 3 unlocks with the points still to earn', () => {
    // Level 8 is reached at 1750 XP, level 9 at 2200.
    expect(nextLevelUnlocks(1860, ECONOMY_CONFIG)).toEqual([
      { level: 9, ids: ['rowboat'], xpToGo: 340 },
      { level: 10, ids: ['pavilion', 'paletteWinter'], xpToGo: 840 },
      { level: 12, ids: ['archBridge'], xpToGo: 1990 },
    ]);
  });

  it('announces fewer unlocks near the end of the table, and none beyond it', () => {
    expect(nextLevelUnlocks(9500, ECONOMY_CONFIG)).toEqual([
      { level: 20, ids: ['paletteDawn', 'secondIslet'], xpToGo: 950 },
    ]);
    expect(nextLevelUnlocks(20_000, ECONOMY_CONFIG)).toEqual([]);
  });
});

describe('the unlocks of real achievements', () => {
  it('gives a firefly for each 10 words in flower, and tells how far the next one is', () => {
    expect(
      achievementsOf({ flowers: 23, lanterns: 0, bestStreak: 0 }, ECONOMY_CONFIG),
    ).toMatchObject({ fireflies: 2, flowersToNextFirefly: 7 });
  });

  it('draws at most 50 fireflies, however many words bloom', () => {
    expect(
      achievementsOf({ flowers: 900, lanterns: 0, bestStreak: 0 }, ECONOMY_CONFIG).fireflies,
    ).toBe(50);
  });

  it('gives a floating lantern for each 5 lantern words', () => {
    expect(
      achievementsOf({ flowers: 0, lanterns: 11, bestStreak: 0 }, ECONOMY_CONFIG),
    ).toMatchObject({ floatingLanterns: 2, lanternsToNextFloatingLantern: 4 });
  });

  it('marks the streak records of 7 and 30 days', () => {
    expect(
      achievementsOf({ flowers: 0, lanterns: 0, bestStreak: 12 }, ECONOMY_CONFIG).streakMarks,
    ).toEqual([7]);
    expect(
      achievementsOf({ flowers: 0, lanterns: 0, bestStreak: 30 }, ECONOMY_CONFIG).streakMarks,
    ).toEqual([7, 30]);
  });
});
