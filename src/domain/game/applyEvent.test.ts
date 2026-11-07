import { describe, expect, it } from 'vitest';
import type { ProgressRecord } from '../progressRecords';
import { addDays } from '../srs/localDay';
import type { Outcome } from '../srs/reviewState';
import {
  applyEvent,
  type AnswerGivenEvent,
  type GameContext,
  type GameEvent,
  type SessionKind,
} from './applyEvent';
import { ECONOMY_CONFIG } from './economyConfig';
import { MINI_GAME_CONFIG } from './miniGameConfig';

const today = '2026-11-07';
const context: GameContext = {
  today,
  goal: 300,
  economy: ECONOMY_CONFIG,
  miniGames: MINI_GAME_CONFIG,
};

function answer(
  cardId: string,
  outcome: Outcome = 'correct',
  sessionKind: SessionKind = 'daily',
): AnswerGivenEvent {
  return {
    type: 'AnswerGiven',
    cardId,
    language: 'zh',
    exercise: 'audioFlashcard',
    outcome,
    rated: true,
    sessionKind,
  };
}

const completed: GameEvent = {
  type: 'SessionCompleted',
  language: 'zh',
  kind: 'daily',
  answers: 12,
  correct: 10,
};

/** Applies the events in order, collecting every effect. */
function play(events: readonly GameEvent[], start: ProgressRecord = {}, at = context) {
  return events.reduce(
    (played, event) => {
      const next = applyEvent(played.progress, event, at);
      return { progress: next.progress, effects: [...played.effects, ...next.effects] };
    },
    { progress: start, effects: [] as ReturnType<typeof applyEvent>['effects'] },
  );
}

describe('applying an answer (GAME_DESIGN.md 9.2)', () => {
  it('awards the points of its outcome and adds them to the total and to the day', () => {
    const { progress, effects } = applyEvent({}, answer('c1'), context);

    expect(progress).toMatchObject({ xp: 10, dailyXp: 10, dailyXpDay: today, level: 1 });
    expect(effects).toContainEqual({
      type: 'XpAwarded',
      amount: 10,
      base: 10,
      multiplier: 1,
      reason: 'correct',
    });
  });

  it.each<[Outcome, number]>([
    ['correctWithHint', 5],
    ['almost', 5],
    ['wrong', 2],
  ])('awards %s %i points', (outcome, xp) => {
    expect(applyEvent({}, answer('c1', outcome), context).progress.xp).toBe(xp);
  });

  it('shows no points for an action a configuration makes worth nothing', () => {
    const economy = { ...ECONOMY_CONFIG, xp: { ...ECONOMY_CONFIG.xp, wrong: 0 } };

    const { progress, effects } = applyEvent({}, answer('c1', 'wrong'), { ...context, economy });

    expect(progress.xp).toBe(0);
    expect(effects).toEqual([]);
  });

  it('counts the answers of each word for the daily cap', () => {
    const { progress } = play([answer('c1'), answer('c1'), answer('c1'), answer('c1')]);

    expect(progress).toMatchObject({ xp: 31, dailyRewardedCount: { c1: 4 } });
  });

  it('starts the day again from zero on a new local day, keeping the total', () => {
    const yesterday: ProgressRecord = {
      xp: 500,
      dailyXp: 500,
      dailyXpDay: '2026-11-06',
      dailyRewardedCount: { c1: 3 },
      dailyAnswers: 40,
    };

    const { progress } = applyEvent(yesterday, answer('c1'), context);

    expect(progress).toMatchObject({
      xp: 510,
      dailyXp: 10,
      dailyXpDay: today,
      dailyRewardedCount: { c1: 1 },
      dailyAnswers: 1,
    });
  });

  it('takes nothing away when the clock shows a day earlier than the last one', () => {
    const later: ProgressRecord = { xp: 40, dailyXp: 40, dailyXpDay: '2026-11-08' };

    const { progress } = applyEvent(later, answer('c1'), context);

    expect(progress).toMatchObject({ xp: 50, dailyXp: 50, dailyXpDay: '2026-11-08' });
  });

  it('tells when the daily goal is reached, once', () => {
    const almostThere: ProgressRecord = { xp: 295, dailyXp: 295, dailyXpDay: today };

    const { effects } = play([answer('c1'), answer('c2')], almostThere);

    expect(effects.filter(({ type }) => type === 'DailyGoalReached')).toEqual([
      { type: 'DailyGoalReached', goal: 300 },
    ]);
  });

  it('halves the points once the daily goal is reached', () => {
    const reached: ProgressRecord = { xp: 300, dailyXp: 300, dailyXpDay: today };

    expect(applyEvent(reached, answer('c1'), context).progress.xp).toBe(305);
  });

  it('tells a level up with the decorations it unlocks, and keeps them', () => {
    const { progress, effects } = applyEvent({ xp: 95 }, answer('c1'), context);

    expect(progress).toMatchObject({ level: 2, unlocks: ['pier'] });
    expect(effects).toContainEqual({ type: 'LevelUp', from: 1, to: 2, unlocks: ['pier'] });
    expect(effects).toContainEqual({ type: 'UnlockGranted', unlockId: 'pier' });
  });

  it('never unlocks a decoration twice', () => {
    const { progress } = applyEvent({ xp: 95, unlocks: ['pier'] }, answer('c1'), context);

    expect(progress.unlocks).toEqual(['pier']);
  });

  it('makes the day active from the 10th answer, which grows the streak', () => {
    const answers = Array.from({ length: 10 }, (_, index) => answer(`c${String(index)}`));

    const nine = play(answers.slice(0, 9));
    const ten = play(answers);

    expect(nine.progress.streakDays ?? 0).toBe(0);
    expect(ten.progress).toMatchObject({ streakDays: 1, bestStreak: 1, lastStreakDay: today });
    expect(ten.effects).toContainEqual({
      type: 'StreakUpdated',
      streakDays: 1,
      bestStreak: 1,
      brumeUsed: [],
      reset: false,
    });
  });

  it('gives points for free practice, but never counts it for the streak', () => {
    const answers = Array.from({ length: 12 }, (_, index) =>
      answer(`c${String(index)}`, 'correct', 'free'),
    );

    const { progress } = play(answers);

    expect(progress.xp).toBe(120);
    expect(progress.streakDays ?? 0).toBe(0);
    expect(progress.dailyAnswers ?? 0).toBe(0);
  });

  it('moves the adaptive level of a mini-game, per language', () => {
    const listened: GameEvent = { ...answer('c1'), exercise: 'listenMeaning' };

    const { progress } = applyEvent({}, listened, context);

    expect(progress.gameLevels).toEqual({ 'listenMeaning:zh': { level: 2, window: [true] } });
  });

  it('leaves the mini-game levels alone for a flashcard', () => {
    expect(applyEvent({}, answer('c1'), context).progress.gameLevels).toBeUndefined();
  });

  it('counts a right answer with a hint as missed for the adaptive level', () => {
    const hinted: GameEvent = { ...answer('c1', 'correctWithHint'), exercise: 'listenMeaning' };

    expect(
      applyEvent({}, hinted, context).progress.gameLevels?.['listenMeaning:zh']?.window,
    ).toEqual([false]);
  });
});

describe('applying a stage reached', () => {
  const grown: GameEvent = {
    type: 'StageReached',
    cardId: 'c1',
    language: 'zh',
    fromStage: 'sprout',
    toStage: 'stem',
    isNewPeak: true,
  };

  it('awards 15 points for a new record of the plant, even beyond the daily goal', () => {
    const farBeyond: ProgressRecord = { xp: 900, dailyXp: 900, dailyXpDay: today };

    const { progress, effects } = applyEvent(farBeyond, grown, context);

    expect(progress.xp).toBe(915);
    expect(effects).toContainEqual({
      type: 'XpAwarded',
      amount: 15,
      base: 15,
      multiplier: 1,
      reason: 'stageReached',
    });
  });

  it('awards nothing for the first sprout: discovering the word already earned its points', () => {
    const sprouted: GameEvent = { ...grown, fromStage: 'seed', toStage: 'sprout' };

    expect(applyEvent({}, sprouted, context).progress.xp ?? 0).toBe(0);
  });

  it('awards nothing when the plant only finds its former stage again', () => {
    const regrown: GameEvent = { ...grown, isNewPeak: false };

    expect(applyEvent({ xp: 10 }, regrown, context)).toEqual({
      progress: {
        xp: 10,
        level: 1,
        dailyXp: 0,
        dailyXpDay: today,
        dailyRewardedCount: {},
        dailyAnswers: 0,
      },
      effects: [],
    });
  });
});

describe('applying a word discovered', () => {
  it('awards 5 points', () => {
    const discovered: GameEvent = { type: 'CardIntroduced', cardId: 'c1', language: 'zh' };

    expect(applyEvent({}, discovered, context).progress.xp).toBe(5);
  });
});

describe('applying a session completed', () => {
  it('awards 30 points and makes the day active, however short the session', () => {
    const { progress, effects } = applyEvent({}, completed, context);

    expect(progress).toMatchObject({ xp: 30, streakDays: 1 });
    expect(effects).toContainEqual(expect.objectContaining({ reason: 'sessionCompleted' }));
  });

  it('counts the day once, however many sessions are completed', () => {
    const { progress } = play([completed, completed]);

    expect(progress).toMatchObject({ xp: 60, streakDays: 1 });
  });

  it('gives nothing for a free practice completed: its answers already earned their points', () => {
    const practice: GameEvent = { ...completed, kind: 'free' };

    const { progress, effects } = applyEvent({}, practice, context);

    expect(progress.xp ?? 0).toBe(0);
    expect(progress.streakDays ?? 0).toBe(0);
    expect(effects).toEqual([]);
  });
});

describe('the streak across days', () => {
  it('covers a missed day with a brume day, and tells it', () => {
    const monday: ProgressRecord = {
      streakDays: 3,
      bestStreak: 3,
      lastStreakDay: '2026-11-04',
      dailyXpDay: '2026-11-04',
    };

    const { progress, effects } = applyEvent(monday, answer('c1'), {
      ...context,
      today: '2026-11-06',
    });

    expect(progress).toMatchObject({ streakDays: 3, brumeDays: ['2026-11-05'] });
    expect(effects).toContainEqual({
      type: 'StreakUpdated',
      streakDays: 3,
      bestStreak: 3,
      brumeUsed: ['2026-11-05'],
      reset: false,
    });
  });

  it('starts a new streak after too many missed days, keeping the record', () => {
    const lastWeek: ProgressRecord = {
      streakDays: 9,
      bestStreak: 9,
      lastStreakDay: '2026-11-02',
      dailyXpDay: '2026-11-02',
    };

    const { progress, effects } = applyEvent(lastWeek, completed, context);

    expect(progress).toMatchObject({ streakDays: 1, bestStreak: 9 });
    expect(effects).toContainEqual(
      expect.objectContaining({ type: 'StreakUpdated', streakDays: 0, reset: true }),
    );
  });
});

describe('the balance of the economy (GAME_DESIGN.md 10.2)', () => {
  /** Seconds per item (GAME_DESIGN.md 11, itemCostSec). */
  const COST = { discovery: 25, audioFlashcard: 8, listenMeaning: 7, summary: 25 };

  /**
   * A normal 10-minute daily session, 90 % right: 5 new words, 36 reviews, a 13-item round of
   * ListenMeaning on words of the session, 2 plants that reach a new stage, and the summary.
   */
  function normalSession(day: string, session: number): GameEvent[] {
    const events: GameEvent[] = [];
    const word = (index: number) => `d${day}-s${String(session)}-w${String(index)}`;
    for (let index = 0; index < 5; index++) {
      events.push({ type: 'CardIntroduced', cardId: word(index), language: 'zh' });
      events.push({ ...answer(word(index)), exercise: 'discovery' });
      events.push({
        type: 'StageReached',
        cardId: word(index),
        language: 'zh',
        fromStage: 'seed',
        toStage: 'sprout',
        isNewPeak: true,
      });
    }
    for (let index = 0; index < 36; index++) {
      events.push(answer(`review-${String(index)}`, index % 10 === 9 ? 'wrong' : 'correct'));
    }
    for (let index = 0; index < 13; index++) {
      const outcome = index % 10 === 9 ? 'wrong' : 'correct';
      events.push({ ...answer(`review-${String(index)}`, outcome), exercise: 'listenMeaning' });
    }
    for (let index = 0; index < 2; index++) {
      events.push({
        type: 'StageReached',
        cardId: `review-${String(index)}`,
        language: 'zh',
        fromStage: 'stem',
        toStage: 'bud',
        isNewPeak: true,
      });
    }
    events.push(completed);
    return events;
  }

  const sessionSeconds =
    5 * COST.discovery + 36 * COST.audioFlashcard + 13 * COST.listenMeaning + COST.summary;

  it('describes a session of about 10 minutes', () => {
    expect(sessionSeconds).toBeGreaterThanOrEqual(8.5 * 60);
    expect(sessionSeconds).toBeLessThanOrEqual(11 * 60);
  });

  /** Points of the effects, milestones (stages) apart or not. */
  function earned(effects: ReturnType<typeof play>['effects'], withMilestones: boolean): number {
    return effects
      .flatMap((effect) => (effect.type === 'XpAwarded' ? [effect] : []))
      .filter((effect) => withMilestones || effect.reason !== 'stageReached')
      .reduce((sum, effect) => sum + effect.amount, 0);
  }

  it('pays 350 to 450 XP for a normal 10-minute session, apart from the stages reached', () => {
    const { effects } = play(normalSession(today, 1));

    expect(earned(effects, false)).toBeGreaterThanOrEqual(350);
    expect(earned(effects, false)).toBeLessThanOrEqual(450);
  });

  it('pays 1.0 to 1.6 times the daily goal for a normal session, stages included (M4)', () => {
    const { progress } = play(normalSession(today, 1));

    expect(progress.xp).toBeGreaterThanOrEqual(1.0 * context.goal);
    expect(progress.xp).toBeLessThanOrEqual(1.6 * context.goal);
  });

  it('pays at most 3 times as much for 60 minutes as for 10, apart from milestones (M6)', () => {
    const sessions = (count: number) =>
      play(Array.from({ length: count }, (_, session) => normalSession(today, session)).flat());

    expect(earned(sessions(6).effects, false)).toBeLessThanOrEqual(
      3 * earned(sessions(1).effects, false),
    );
  });

  /** One normal session a day, for `days` days. */
  function diligent(days: number): ProgressRecord {
    let progress: ProgressRecord = {};
    for (let offset = 0; offset < days; offset++) {
      const day = addDays('2026-11-01', offset);
      progress = play(normalSession(day, 0), progress, { ...context, today: day }).progress;
    }
    return progress;
  }

  it('reaches a level between 8 and 12 after 7 days of one session a day (M5)', () => {
    const { level } = diligent(7);

    expect(level).toBeGreaterThanOrEqual(8);
    expect(level).toBeLessThanOrEqual(12);
  });

  it('takes 2 to 4 days of one session per new level from the second week to the sixth', () => {
    const levelsByDay = Array.from({ length: 42 }, (_, day) => diligent(day + 1).level ?? 1);
    const levelsGained = (levelsByDay[41] ?? 0) - (levelsByDay[6] ?? 0);
    const daysPerLevel = (42 - 7) / levelsGained;

    expect(daysPerLevel).toBeGreaterThanOrEqual(2);
    expect(daysPerLevel).toBeLessThanOrEqual(4);
  });
});
