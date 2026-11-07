import type { Language } from '../card';
import type { ExerciseType, ProgressRecord } from '../progressRecords';
import type { LocalDay } from '../srs/localDay';
import type { Outcome, Stage } from '../srs/reviewState';
import { isAtLeast } from '../srs/stage';
import { gameLevelKey, initialGameLevel, recordGameAnswer } from './adaptiveDifficulty';
import { earnXp, ledgerOn, type DailyLedger } from './dailyXp';
import type { EconomyConfig } from './economyConfig';
import { levelFor } from './level';
import type { MiniGameConfig } from './miniGameConfig';
import { markActiveDay, rollStreak, type StreakState } from './streak';
import { unlocksBetweenLevels } from './unlocks';
import { xpFor, type XpReason } from './xp';

/** Where an answer comes from: free practice earns points but never counts for the streak. */
export type SessionKind = 'daily' | 'free' | 'dictation' | 'miniGame';

export interface AnswerGivenEvent {
  type: 'AnswerGiven';
  cardId: string;
  language: Language;
  exercise: ExerciseType;
  outcome: Outcome;
  /** False when the word was already rated today: its memory was left untouched. */
  rated: boolean;
  sessionKind: SessionKind;
}

/** The domain events the game listens to (GAME_DESIGN.md 9.1), reduced to what it needs. */
export type GameEvent =
  | AnswerGivenEvent
  | { type: 'CardIntroduced'; cardId: string; language: Language }
  | {
      type: 'StageReached';
      cardId: string;
      language: Language;
      fromStage: Stage;
      toStage: Stage;
      /** True when the plant beats its record (peakStage). */
      isNewPeak: boolean;
    }
  | {
      type: 'SessionCompleted';
      language: Language;
      kind: SessionKind;
      answers: number;
      correct: number;
    };

/** What the interface shows of an event (GAME_DESIGN.md 9.2). */
export type GameEffect =
  | { type: 'XpAwarded'; amount: number; base: number; multiplier: number; reason: XpReason }
  | { type: 'LevelUp'; from: number; to: number; unlocks: string[] }
  | { type: 'DailyGoalReached'; goal: number }
  | {
      type: 'StreakUpdated';
      streakDays: number;
      bestStreak: number;
      brumeUsed: string[];
      reset: boolean;
    }
  | { type: 'UnlockGranted'; unlockId: string };

export interface GameContext {
  /** The learner's day of the event. */
  today: LocalDay;
  /** The daily goal chosen in the settings. */
  goal: number;
  economy: EconomyConfig;
  miniGames: Pick<MiniGameConfig, 'adaptive'>;
}

export interface GameUpdate {
  progress: ProgressRecord;
  effects: GameEffect[];
}

/** Exercises with an adaptive level of their own (GAME_DESIGN.md 6.0). */
const MINI_GAMES: ReadonlySet<ExerciseType> = new Set(['listenMeaning']);

/**
 * The game reducer: pure, it never touches the spaced repetition. It returns the new progress
 * and what the interface should show (level up, unlocks, daily goal, streak).
 */
export function applyEvent(
  start: ProgressRecord,
  event: GameEvent,
  context: GameContext,
): GameUpdate {
  const effects: GameEffect[] = [];
  // A clock going back keeps the later day already seen: nothing is taken away.
  const at = { ...context, today: ledgerOn(ledgerOf(start), context.today).dailyXpDay };
  const progress = startDay(start, at, effects);
  const after = reduce(progress, event, at, effects);
  return { progress: rewardLevel(start, after, at, effects), effects };
}

function reduce(
  progress: ProgressRecord,
  event: GameEvent,
  context: GameContext,
  effects: GameEffect[],
): ProgressRecord {
  switch (event.type) {
    case 'AnswerGiven':
      return answerGiven(progress, event, context, effects);
    case 'CardIntroduced':
      return earn(progress, 'cardIntroduced', context, effects);
    case 'StageReached':
      return event.isNewPeak && isAtLeast(event.toStage, context.economy.rewardedStageFloor)
        ? earn(progress, 'stageReached', context, effects)
        : progress;
    case 'SessionCompleted':
      if (event.kind === 'free') {
        // Its answers already earned their points; a free practice is never the day's session.
        return progress;
      }
      return activeDay(earn(progress, 'sessionCompleted', context, effects), context, effects);
  }
}

function answerGiven(
  progress: ProgressRecord,
  event: AnswerGivenEvent,
  context: GameContext,
  effects: GameEffect[],
): ProgressRecord {
  const rewarded = earn(progress, event.outcome, context, effects, event.cardId);
  const leveled = MINI_GAMES.has(event.exercise) ? adaptLevel(rewarded, event, context) : rewarded;
  if (event.sessionKind === 'free') {
    return leveled;
  }
  const dailyAnswers = (leveled.dailyAnswers ?? 0) + 1;
  const counted = { ...leveled, dailyAnswers };
  return dailyAnswers >= context.economy.activeDayMinAnswers
    ? activeDay(counted, context, effects)
    : counted;
}

function adaptLevel(
  progress: ProgressRecord,
  { exercise, language, outcome }: AnswerGivenEvent,
  { miniGames }: GameContext,
): ProgressRecord {
  const key = gameLevelKey(exercise, language);
  const levels = progress.gameLevels ?? {};
  const current = levels[key] ?? initialGameLevel(miniGames);
  const next = recordGameAnswer(current, outcome === 'correct', miniGames);
  return { ...progress, gameLevels: { ...levels, [key]: next } };
}

/** On a new day: the daily ledger starts from zero, and missed days are rolled into the streak. */
function startDay(
  progress: ProgressRecord,
  { today, economy }: GameContext,
  effects: GameEffect[],
): ProgressRecord {
  if (progress.dailyXpDay === today) {
    return progress;
  }
  const roll = rollStreak(streakOf(progress), today, economy);
  if (roll.reset || roll.brumeUsed.length > 0) {
    effects.push({
      type: 'StreakUpdated',
      streakDays: roll.state.streakDays,
      bestStreak: roll.state.bestStreak,
      brumeUsed: roll.brumeUsed,
      reset: roll.reset,
    });
  }
  return {
    ...progress,
    ...ledgerFields({ dailyXp: 0, dailyXpDay: today, dailyRewardedCount: {} }, today),
    dailyAnswers: 0,
    ...streakFields(roll.state),
  };
}

/** The day becomes active: the streak grows, once a day. */
function activeDay(
  progress: ProgressRecord,
  { today }: GameContext,
  effects: GameEffect[],
): ProgressRecord {
  const before = streakOf(progress);
  const after = markActiveDay(before, today);
  if (after === before) {
    return progress;
  }
  effects.push({
    type: 'StreakUpdated',
    streakDays: after.streakDays,
    bestStreak: after.bestStreak,
    brumeUsed: [],
    reset: false,
  });
  return { ...progress, ...streakFields(after) };
}

function earn(
  progress: ProgressRecord,
  reason: XpReason,
  { goal, economy, today }: GameContext,
  effects: GameEffect[],
  cardId?: string,
): ProgressRecord {
  const before = ledgerOf(progress);
  const earned = earnXp(
    before,
    xpFor(reason, economy),
    cardId === undefined ? { goal } : { goal, cardId },
    economy,
  );
  if (earned.gained > 0) {
    effects.push({
      type: 'XpAwarded',
      amount: earned.gained,
      base: earned.base,
      multiplier: earned.multiplier,
      reason,
    });
  }
  if (before.dailyXp < goal && earned.ledger.dailyXp >= goal) {
    effects.push({ type: 'DailyGoalReached', goal });
  }
  return {
    ...progress,
    ...ledgerFields(earned.ledger, today),
    xp: (progress.xp ?? 0) + earned.gained,
  };
}

/** The level follows the total; the decorations of the levels crossed are kept for good. */
function rewardLevel(
  start: ProgressRecord,
  progress: ProgressRecord,
  { economy }: GameContext,
  effects: GameEffect[],
): ProgressRecord {
  const from = levelFor(start.xp ?? 0, economy);
  const to = levelFor(progress.xp ?? 0, economy);
  if (to === from) {
    return progress.xp === undefined ? progress : { ...progress, level: to };
  }
  const owned = new Set(progress.unlocks ?? []);
  const unlocks = unlocksBetweenLevels(from, to, economy).filter((id) => !owned.has(id));
  effects.push({ type: 'LevelUp', from, to, unlocks });
  effects.push(...unlocks.map((unlockId) => ({ type: 'UnlockGranted' as const, unlockId })));
  return { ...progress, level: to, unlocks: [...owned, ...unlocks] };
}

function ledgerOf(progress: ProgressRecord): DailyLedger {
  return {
    dailyXp: progress.dailyXp ?? 0,
    dailyXpDay: progress.dailyXpDay,
    dailyRewardedCount: progress.dailyRewardedCount ?? {},
  };
}

function ledgerFields(ledger: DailyLedger, today: LocalDay): Partial<ProgressRecord> {
  return {
    dailyXp: ledger.dailyXp,
    dailyXpDay: today,
    dailyRewardedCount: { ...ledger.dailyRewardedCount },
  };
}

function streakOf(progress: ProgressRecord): StreakState {
  return {
    streakDays: progress.streakDays ?? 0,
    bestStreak: progress.bestStreak ?? 0,
    brumeDays: progress.brumeDays ?? [],
    ...(progress.lastStreakDay === undefined ? {} : { lastStreakDay: progress.lastStreakDay }),
  };
}

/** Writes the streak back once it has started; before its first active day, there is none. */
function streakFields(state: StreakState): Partial<ProgressRecord> {
  if (state.lastStreakDay === undefined) {
    return {};
  }
  return {
    streakDays: state.streakDays,
    bestStreak: state.bestStreak,
    brumeDays: [...state.brumeDays],
    lastStreakDay: state.lastStreakDay,
  };
}
