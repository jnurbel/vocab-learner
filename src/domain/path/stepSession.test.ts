import { describe, expect, it } from 'vitest';
import type { Card } from '../card';
import type { PathProgressRecord } from '../progressRecords';
import { createInitialReviewState } from '../srs/reviewState';
import { PATH_CONFIG } from './pathConfig';
import { stepSessionWords } from './stepSession';

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

const cards = ['a', 'b', 'c', 'd'].map((id) => card(id));
const recall: Record<string, number> = { a: 0.9, b: 0.2, c: 0.5, d: 0.7 };
const retrievability = (cardId: string) => recall[cardId] ?? 0;
const progress: PathProgressRecord = {
  labelId: 'lesson',
  language: 'zh',
  stepAttempts: { listen: { a: true, c: false } },
};

describe('stepSessionWords', () => {
  it('picks the words not meeting the criterion of the step yet, least remembered first', () => {
    expect(
      stepSessionWords('listen', { cards, states: [], progress }, retrievability, PATH_CONFIG),
    ).toEqual(['b', 'c', 'd']);
  });

  it('picks the words never introduced for the discover step', () => {
    const states = [{ ...createInitialReviewState('a', new Date(0)), reps: 2 }];

    expect(stepSessionWords('discover', { cards, states }, retrievability, PATH_CONFIG)).toEqual([
      'b',
      'c',
      'd',
    ]);
  });

  it('picks only words with an example for the sentences step', () => {
    const withExamples = [...cards, card('x', '例句'), card('y', '例句')];
    const recalled = { ...progress, stepAttempts: { sentences: { x: true } } };

    expect(
      stepSessionWords(
        'sentences',
        { cards: withExamples, states: [], progress: recalled },
        retrievability,
        PATH_CONFIG,
      ),
    ).toEqual(['y']);
  });

  it('fits the session in about 4 minutes of the exercise of the step', () => {
    const many = Array.from({ length: 50 }, (_, index) => card(`w${String(index)}`));
    const sized = (step: Parameters<typeof stepSessionWords>[0]) =>
      stepSessionWords(step, { cards: many, states: [] }, () => 0, PATH_CONFIG).length;

    expect(sized('discover')).toBe(9);
    expect(sized('listen')).toBe(34);
    expect(sized('recognize')).toBe(40);
    expect(sized('type')).toBe(17);
    expect(sized('dictation')).toBe(20);
  });

  it('breaks ties of recall by the order of the words, for a stable session', () => {
    expect(stepSessionWords('type', { cards, states: [] }, () => 0.5, PATH_CONFIG)).toEqual([
      'a',
      'b',
      'c',
      'd',
    ]);
  });

  it('asks no word for the final challenge, which has its own composition', () => {
    expect(stepSessionWords('finalChallenge', { cards, states: [] }, () => 0, PATH_CONFIG)).toEqual(
      [],
    );
  });
});
