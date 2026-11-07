import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../srs/config';
import { createInitialReviewState, type ReviewState } from '../srs/reviewState';
import { answerEvents, dailyGoalOf, type AnsweredWord } from './answerEvents';
import { ECONOMY_CONFIG } from './economyConfig';

function state(overrides: Partial<ReviewState>): ReviewState {
  return {
    cardId: 'c1',
    due: '2026-11-07T08:00:00.000Z',
    stability: 2,
    difficulty: 5,
    reps: 2,
    lapses: 0,
    state: 'review',
    successDays: 1,
    peakStage: 'sprout',
    ...overrides,
  };
}

const word: AnsweredWord = {
  cardId: 'c1',
  language: 'zh',
  exercise: 'audioFlashcard',
  outcome: 'correct',
  rated: true,
  sessionKind: 'daily',
};

describe('the game events of an answer (GAME_DESIGN.md 9.1)', () => {
  it('tells the answer given', () => {
    expect(answerEvents(word, GAME_CONFIG)).toEqual([{ type: 'AnswerGiven', ...word }]);
  });

  it('tells a word discovered before its first answer', () => {
    const before = createInitialReviewState('c1', new Date('2026-11-07T08:00:00Z'));
    const after = state({ reps: 1, successDays: 1, stability: 1 });

    expect(
      answerEvents({ ...word, exercise: 'discovery', before, after }, GAME_CONFIG).map(
        ({ type }) => type,
      ),
    ).toEqual(['CardIntroduced', 'AnswerGiven', 'StageReached']);
  });

  it('tells a stage reached, and whether the plant beats its record', () => {
    const before = state({});
    const after = state({ stability: 4, successDays: 2, peakStage: 'stem' });

    expect(answerEvents({ ...word, before, after }, GAME_CONFIG).at(-1)).toEqual({
      type: 'StageReached',
      cardId: 'c1',
      language: 'zh',
      fromStage: 'sprout',
      toStage: 'stem',
      isNewPeak: true,
    });
  });

  it('tells a plant finding its former stage again as no new record', () => {
    const before = state({ peakStage: 'bud' });
    const after = state({ stability: 4, successDays: 2, peakStage: 'bud' });

    expect(answerEvents({ ...word, before, after }, GAME_CONFIG).at(-1)).toMatchObject({
      type: 'StageReached',
      isNewPeak: false,
    });
  });

  it('tells no stage when the plant stays or goes down', () => {
    const before = state({ stability: 4, successDays: 2, peakStage: 'stem' });
    const after = state({ stability: 1, successDays: 2, peakStage: 'stem' });

    expect(answerEvents({ ...word, before, after }, GAME_CONFIG).map(({ type }) => type)).toEqual([
      'AnswerGiven',
    ]);
  });
});

describe('the daily goal of the settings', () => {
  it('is 300 XP by default', () => {
    expect(dailyGoalOf(undefined, ECONOMY_CONFIG)).toBe(300);
  });

  it.each([150, 300, 450])('follows a chosen goal of %i XP', (goal) => {
    expect(dailyGoalOf({ dailyGoalXp: goal }, ECONOMY_CONFIG)).toBe(goal);
  });

  it('ignores a goal that is not one of the choices', () => {
    expect(dailyGoalOf({ dailyGoalXp: 1 }, ECONOMY_CONFIG)).toBe(300);
  });
});
