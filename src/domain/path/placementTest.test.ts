import { describe, expect, it } from 'vitest';
import type { Card } from '../card';
import type { PathProgressRecord, SessionResultRecord } from '../progressRecords';
import { PATH_CONFIG } from './pathConfig';
import { applyPlacementTest, drawPlacementTest, scorePlacementTest } from './placementTest';

function card(id: string, example?: string): Card {
  return {
    id,
    language: 'zh',
    term: `词${id}`,
    translation: `mot ${id}`,
    ...(example === undefined ? {} : { example }),
    labelIds: ['lesson'],
    source: 'manual',
    createdAt: '2026-11-01T08:00:00.000Z',
    updatedAt: '2026-11-01T08:00:00.000Z',
  };
}

const many = Array.from({ length: 14 }, (_, index) => card(`w${String(index)}`));

function result(cardId: string, correct: boolean, exercise: SessionResultRecord['exercise']) {
  return { cardId, outcome: correct ? 'correct' : 'wrong', exercise } as SessionResultRecord;
}

describe('drawPlacementTest', () => {
  it('draws 10 different words of the label for the step', () => {
    const test = drawPlacementTest(many, 'listen', 'seed-1', PATH_CONFIG);

    expect(test.step).toBe('listen');
    expect(test.cardIds).toHaveLength(10);
    expect(new Set(test.cardIds).size).toBe(10);
    expect(test.cardIds.every((id) => many.some((word) => word.id === id))).toBe(true);
  });

  it('draws the same words for the same seed, whatever the order of the words', () => {
    const first = drawPlacementTest(many, 'type', 'seed-1', PATH_CONFIG);
    const again = drawPlacementTest([...many].reverse(), 'type', 'seed-1', PATH_CONFIG);

    expect(again.cardIds).toEqual(first.cardIds);
  });

  it('asks every word of a label shorter than the test', () => {
    const test = drawPlacementTest(many.slice(0, 4), 'dictation', 'seed', PATH_CONFIG);

    expect([...test.cardIds].sort()).toEqual(['w0', 'w1', 'w2', 'w3']);
  });

  it('draws only words with an example for the sentences step', () => {
    const words = [...many.slice(0, 3), card('x', '例句 x'), card('y', '例句 y')];

    const test = drawPlacementTest(words, 'sentences', 'seed', PATH_CONFIG);

    expect([...test.cardIds].sort()).toEqual(['x', 'y']);
  });
});

describe('scorePlacementTest', () => {
  const test = { step: 'listen' as const, cardIds: many.slice(0, 10).map(({ id }) => id) };

  it('passes with 9 right answers out of 10', () => {
    const results = test.cardIds.map((id, index) => result(id, index > 0, 'listenMeaning'));

    expect(scorePlacementTest(test, results, PATH_CONFIG)).toEqual({
      step: 'listen',
      correct: 9,
      total: 10,
      passed: true,
    });
  });

  it('fails with 8 right answers out of 10', () => {
    const results = test.cardIds.map((id, index) => result(id, index > 1, 'listenMeaning'));

    expect(scorePlacementTest(test, results, PATH_CONFIG)).toMatchObject({
      correct: 8,
      passed: false,
    });
  });

  it('counts the first answer of each word only, in the exercises of the step', () => {
    const [first = '', second = ''] = test.cardIds;
    const results = [
      result(first, false, 'listenMeaning'),
      result(first, true, 'listenMeaning'),
      result(second, true, 'typeEcho'),
      result('other', true, 'listenMeaning'),
    ];

    expect(scorePlacementTest(test, results, PATH_CONFIG)).toMatchObject({ correct: 0 });
  });

  it('counts a word left unanswered as missed', () => {
    const results = test.cardIds.slice(0, 9).map((id) => result(id, true, 'listenMeaning'));

    expect(scorePlacementTest(test, results, PATH_CONFIG)).toMatchObject({
      correct: 9,
      total: 10,
      passed: true,
    });
    expect(scorePlacementTest(test, results.slice(0, 8), PATH_CONFIG).passed).toBe(false);
  });

  it('never passes an empty test', () => {
    expect(scorePlacementTest({ step: 'listen', cardIds: [] }, [], PATH_CONFIG).passed).toBe(false);
  });
});

describe('applyPlacementTest', () => {
  const cards = many.slice(0, 5);
  const onListen: PathProgressRecord = {
    labelId: 'lesson',
    language: 'zh',
    steps: { discover: 'validated' },
  };

  it('validates the current step of a passed test, and tells the game', () => {
    const advanced = applyPlacementTest(
      { cards, states: [], progress: onListen },
      { step: 'listen', correct: 5, total: 5, passed: true },
      PATH_CONFIG,
    );

    expect(advanced.progress.steps).toEqual({ discover: 'validated', listen: 'validated' });
    expect(advanced.events).toEqual([
      {
        type: 'PathStepValidated',
        labelId: 'lesson',
        language: 'zh',
        step: 'listen',
        via: 'placementTest',
      },
    ]);
  });

  it('then validates the next steps already met', () => {
    const allRight = Object.fromEntries(cards.map(({ id }) => [id, true]));
    const progress = { ...onListen, stepAttempts: { recognize: allRight } };

    const advanced = applyPlacementTest(
      { cards, states: [], progress, toneEchoEligible: () => false },
      { step: 'listen', correct: 5, total: 5, passed: true },
      PATH_CONFIG,
    );

    expect(advanced.events.map(({ step, via }) => [step, via])).toEqual([
      ['listen', 'placementTest'],
      ['recognize', 'progress'],
    ]);
  });

  it('changes nothing after a failed test: nothing is lost', () => {
    const advanced = applyPlacementTest(
      { cards, states: [], progress: onListen },
      { step: 'listen', correct: 3, total: 5, passed: false },
      PATH_CONFIG,
    );

    expect(advanced).toEqual({ progress: onListen, events: [] });
  });

  it('ignores a test of a step that is no longer the current one', () => {
    const advanced = applyPlacementTest(
      { cards, states: [], progress: onListen },
      { step: 'type', correct: 5, total: 5, passed: true },
      PATH_CONFIG,
    );

    expect(advanced.events).toEqual([]);
  });

  it('never validates the final challenge by a placement test', () => {
    const steps = {
      discover: 'validated',
      listen: 'validated',
      recognize: 'validated',
      type: 'validated',
      dictation: 'validated',
    } as const;

    const advanced = applyPlacementTest(
      { cards, states: [], progress: { ...onListen, steps } },
      { step: 'finalChallenge', correct: 5, total: 5, passed: true },
      PATH_CONFIG,
    );

    expect(advanced.events).toEqual([]);
  });
});
