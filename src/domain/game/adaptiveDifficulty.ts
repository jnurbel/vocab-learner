import type { Language } from '../card';
import type { GameLevel } from '../progressRecords';
import type { Stage } from '../srs/reviewState';
import type { Difficulty, MiniGameConfig } from './miniGameConfig';

type AdaptiveConfig = Pick<MiniGameConfig, 'adaptive'>;

/** The key of Progress.gameLevels: one level per mini-game and language. */
export function gameLevelKey(game: string, language: Language): string {
  return `${game}:${language}`;
}

export function initialGameLevel({ adaptive }: AdaptiveConfig): GameLevel {
  return { level: adaptive.initialLevel, window: [] };
}

/**
 * Slides the window of the last answers; enough right answers raise the level, too few lower it,
 * and the window starts again after each change. The change is silent (GAME_DESIGN.md 6.0).
 */
export function recordGameAnswer(
  current: GameLevel,
  correct: boolean,
  { adaptive }: AdaptiveConfig,
): GameLevel {
  const window = [...current.window, correct].slice(-adaptive.windowSize);
  if (window.length < adaptive.windowSize) {
    return { level: current.level, window };
  }
  const right = window.filter(Boolean).length;
  const step = right >= adaptive.upMinCorrect ? 1 : right <= adaptive.downMaxCorrect ? -1 : 0;
  const level = clampLevel(current.level + step);
  return level === current.level ? { level, window } : { level, window: [] };
}

/** The difficulty of a question on a word: a young word is never asked at the hardest level. */
export function difficultyFor(
  level: Difficulty,
  stage: Stage,
  { adaptive }: AdaptiveConfig,
): Difficulty {
  if (stage === 'seed') {
    return 1;
  }
  return stage === 'sprout' ? clampLevel(Math.min(level, adaptive.sproutMaxLevel)) : level;
}

function clampLevel(level: number): Difficulty {
  return Math.min(3, Math.max(1, level)) as Difficulty;
}
