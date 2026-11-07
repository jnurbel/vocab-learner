import type { EconomyConfig } from './economyConfig';
import { xpForLevel } from './level';

export interface UpcomingUnlock {
  level: number;
  ids: readonly string[];
  xpToGo: number;
}

/** How many words reached a stage for good (peakStage), and the best streak. */
export interface AchievementCounts {
  flowers: number;
  lanterns: number;
  bestStreak: number;
}

export interface Achievements {
  fireflies: number;
  flowersToNextFirefly: number;
  floatingLanterns: number;
  lanternsToNextFloatingLantern: number;
  /** The streak records reached, such as [7, 30]. */
  streakMarks: number[];
}

type UnlockConfig = Pick<EconomyConfig, 'levelUnlocks' | 'levelBaseXp' | 'levelStepXp'>;

/** The decorations of the levels above `from` up to `to`, in order. */
export function unlocksBetweenLevels(from: number, to: number, config: UnlockConfig): string[] {
  return config.levelUnlocks
    .filter(({ level }) => level > from && level <= to)
    .flatMap(({ ids }) => ids);
}

/** The next unlocks, shown in advance with their exact condition (GAME_DESIGN.md 4.5). */
export function nextLevelUnlocks(xp: number, config: UnlockConfig, count = 3): UpcomingUnlock[] {
  return config.levelUnlocks
    .map(({ level, ids }) => ({ level, ids, xpToGo: xpForLevel(level, config) - xp }))
    .filter(({ xpToGo }) => xpToGo > 0)
    .slice(0, count);
}

/** Unlocks earned by real learning: derived from the words, never stored nor lost. */
export function achievementsOf(
  { flowers, lanterns, bestStreak }: AchievementCounts,
  config: EconomyConfig,
): Achievements {
  const { firefliesPerFlowers: perFirefly, floatingLanternPerLanterns: perLantern } = config;
  return {
    fireflies: Math.min(Math.floor(flowers / perFirefly), config.firefliesVisualCap),
    flowersToNextFirefly: perFirefly - (flowers % perFirefly),
    floatingLanterns: Math.floor(lanterns / perLantern),
    lanternsToNextFloatingLantern: perLantern - (lanterns % perLantern),
    streakMarks: config.streakUnlockMilestones.filter((days) => bestStreak >= days),
  };
}
