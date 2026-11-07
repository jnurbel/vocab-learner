import { dailyGoalOf } from '../../domain/game/answerEvents';
import {
  applyEvent,
  type GameContext,
  type GameEffect,
  type GameEvent,
} from '../../domain/game/applyEvent';
import { ECONOMY_CONFIG, type EconomyConfig } from '../../domain/game/economyConfig';
import { levelProgress } from '../../domain/game/level';
import { MINI_GAME_CONFIG, type MiniGameConfig } from '../../domain/game/miniGameConfig';
import type { XpReason } from '../../domain/game/xp';
import type { ProgressRecord } from '../../domain/progressRecords';
import type { LocalDay } from '../../domain/srs/localDay';
import type { ProgressUpdate } from '../../storage/studyRepository';

/** What a session brought, for its summary (GAME_DESIGN.md 8.3). */
export interface RewardsSummary {
  xpGained: number;
  /** Points of the session per reason, for the foldable detail. */
  breakdown: Partial<Record<XpReason, number>>;
  dailyXp: number;
  goal: number;
  goalReached: boolean;
  streakDays: number;
  bestStreak: number;
  level: number;
  xpToNext: number;
  /** The levels reached during the session. */
  levelUps: number[];
  unlocks: string[];
}

interface Played {
  progress: ProgressRecord;
  goal: number;
  effects: GameEffect[];
}

/**
 * Applies the game to each answer of a session and adds up what it brought. An update counts
 * only once its save is confirmed, so that a failed save shows no points.
 */
export class SessionRewards {
  private pending: Played | undefined;
  private last: Played | undefined;
  private readonly effects: GameEffect[] = [];

  constructor(
    private readonly economy: EconomyConfig = ECONOMY_CONFIG,
    private readonly miniGames: Pick<MiniGameConfig, 'adaptive'> = MINI_GAME_CONFIG,
  ) {}

  /** The update to write together with the answer; call confirm() once it is saved. */
  update(events: readonly GameEvent[], today: LocalDay): ProgressUpdate {
    return ({ progress, settings }) => {
      const context: GameContext = {
        today,
        goal: dailyGoalOf(settings, this.economy),
        economy: this.economy,
        miniGames: this.miniGames,
      };
      const played = events.reduce<Played>(
        (sofar, event) => {
          const next = applyEvent(sofar.progress, event, context);
          return {
            ...sofar,
            progress: next.progress,
            effects: [...sofar.effects, ...next.effects],
          };
        },
        { progress, goal: context.goal, effects: [] },
      );
      this.pending = played;
      return played.progress;
    };
  }

  confirm(): void {
    if (this.pending === undefined) {
      return;
    }
    this.effects.push(...this.pending.effects);
    this.last = this.pending;
    this.pending = undefined;
  }

  summary(): RewardsSummary | undefined {
    if (this.last === undefined) {
      return undefined;
    }
    const { progress, goal } = this.last;
    const breakdown: Partial<Record<XpReason, number>> = {};
    const levelUps: number[] = [];
    const unlocks: string[] = [];
    for (const effect of this.effects) {
      if (effect.type === 'XpAwarded') {
        breakdown[effect.reason] = (breakdown[effect.reason] ?? 0) + effect.amount;
      } else if (effect.type === 'LevelUp') {
        levelUps.push(effect.to);
        unlocks.push(...effect.unlocks);
      }
    }
    const xp = progress.xp ?? 0;
    const dailyXp = progress.dailyXp ?? 0;
    const { level, xpToNext } = levelProgress(xp, this.economy);
    return {
      xpGained: Object.values(breakdown).reduce((sum, amount) => sum + amount, 0),
      breakdown,
      dailyXp,
      goal,
      goalReached: dailyXp >= goal,
      streakDays: progress.streakDays ?? 0,
      bestStreak: progress.bestStreak ?? 0,
      level,
      xpToNext,
      levelUps,
      unlocks,
    };
  }
}
