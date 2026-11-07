import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../../domain/game/applyEvent';
import type { ProgressRecord } from '../../domain/progressRecords';
import { SessionRewards } from './sessionRewards';

const today = '2026-11-07';

function right(cardId: string): GameEvent {
  return {
    type: 'AnswerGiven',
    cardId,
    language: 'zh',
    exercise: 'audioFlashcard',
    outcome: 'correct',
    rated: true,
    sessionKind: 'daily',
  };
}

/** Plays an update as the repository does, then confirms it was saved. */
function save(rewards: SessionRewards, events: GameEvent[], stored: ProgressRecord = {}) {
  const progress = rewards.update(events, today)({ progress: stored, settings: undefined });
  rewards.confirm();
  return progress;
}

describe('the rewards of a session', () => {
  it('has nothing to show before the first answer is saved', () => {
    expect(new SessionRewards().summary()).toBeUndefined();
  });

  it('adds up the points of the session, by reason, with the day, the streak and the level', () => {
    const rewards = new SessionRewards();
    const stored = save(rewards, [right('a')], { xp: 60, dailyXp: 60, dailyXpDay: today });
    save(rewards, [right('b'), { type: 'CardIntroduced', cardId: 'c', language: 'zh' }], stored);

    expect(rewards.summary()).toEqual({
      xpGained: 25,
      breakdown: { correct: 20, cardIntroduced: 5 },
      dailyXp: 85,
      goal: 300,
      goalReached: false,
      streakDays: 0,
      bestStreak: 0,
      level: 1,
      xpToNext: 15,
      levelUps: [],
      unlocks: [],
    });
  });

  it('follows the daily goal of the settings', () => {
    const rewards = new SessionRewards();
    rewards.update([right('a')], today)({ progress: {}, settings: { dailyGoalXp: 150 } });
    rewards.confirm();

    expect(rewards.summary()?.goal).toBe(150);
  });

  it('tells the levels reached and the decorations unlocked during the session', () => {
    const rewards = new SessionRewards();
    save(rewards, [right('a')], { xp: 245 });

    expect(rewards.summary()).toMatchObject({
      level: 3,
      levelUps: [3],
      unlocks: ['pathLamps'],
    });
  });

  it('tells the daily goal reached', () => {
    const rewards = new SessionRewards();
    save(rewards, [right('a')], { xp: 295, dailyXp: 295, dailyXpDay: today });

    expect(rewards.summary()?.goalReached).toBe(true);
  });

  it('counts nothing of an answer whose save failed', () => {
    const rewards = new SessionRewards();
    rewards.update([right('a')], today)({ progress: {}, settings: undefined });

    expect(rewards.summary()).toBeUndefined();
  });

  it('confirms nothing twice', () => {
    const rewards = new SessionRewards();
    save(rewards, [right('a')]);
    rewards.confirm();

    expect(rewards.summary()?.xpGained).toBe(10);
  });
});
