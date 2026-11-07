import type { EconomyConfig } from './economyConfig';

type LevelConfig = Pick<EconomyConfig, 'levelBaseXp' | 'levelStepXp'>;

export interface LevelProgress {
  level: number;
  /** Total XP at which the current level was reached. */
  levelStartXp: number;
  nextLevelXp: number;
  xpToNext: number;
}

/** Total XP needed to reach `level` (GAME_DESIGN.md 4.3): T(n) = 100(n-1) + 25(n-1)(n-2). */
export function xpForLevel(level: number, { levelBaseXp, levelStepXp }: LevelConfig): number {
  const steps = level - 1;
  return levelBaseXp * steps + (levelStepXp * steps * (steps - 1)) / 2;
}

/** The highest level whose total is reached; there is no highest level. */
export function levelFor(xp: number, config: LevelConfig): number {
  let level = 1;
  while (xpForLevel(level + 1, config) <= xp) {
    level += 1;
  }
  return level;
}

export function levelProgress(xp: number, config: LevelConfig): LevelProgress {
  const level = levelFor(xp, config);
  const levelStartXp = xpForLevel(level, config);
  const nextLevelXp = xpForLevel(level + 1, config);
  return { level, levelStartXp, nextLevelXp, xpToNext: nextLevelXp - xp };
}
