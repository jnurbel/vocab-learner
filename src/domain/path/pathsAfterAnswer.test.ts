import { describe, expect, it } from 'vitest';
import type { Card } from '../card';
import type { Label } from '../label';
import type { PathProgressRecord } from '../progressRecords';
import { createInitialReviewState } from '../srs/reviewState';
import { PATH_CONFIG } from './pathConfig';
import { pathsAfterAnswer, type PathsInput } from './pathsAfterAnswer';

function card(id: string, labelIds: string[], language: Card['language'] = 'zh'): Card {
  return {
    id,
    language,
    term: `${language}-${id}`,
    translation: `mot ${id}`,
    labelIds,
    source: 'manual',
    createdAt: '2026-11-01T08:00:00.000Z',
    updatedAt: '2026-11-01T08:00:00.000Z',
  };
}

function label(id: string, isFocus: boolean): Label {
  return {
    id,
    name: id,
    isFocus,
    createdAt: '2026-11-01T08:00:00.000Z',
    updatedAt: '2026-11-01T08:00:00.000Z',
  };
}

const cards = [
  card('a', ['pinned', 'other']),
  card('b', ['pinned']),
  card('c', ['pinned', 'second']),
  card('d', ['pinned'], 'en'),
];
const labels = [label('pinned', true), label('other', false), label('second', true)];

function input(extra: Partial<PathsInput> = {}): PathsInput {
  return {
    answer: { cardId: 'a', exercise: 'listenMeaning', outcome: 'correct' },
    cards,
    labels,
    states: [],
    paths: [],
    ...extra,
  };
}

describe('pathsAfterAnswer', () => {
  it('records the answer in the path of each pinned label of the word, in its language', () => {
    const { paths } = pathsAfterAnswer(input(), PATH_CONFIG);

    expect(paths).toEqual([
      { labelId: 'pinned', language: 'zh', stepAttempts: { listen: { a: true } } },
    ]);
  });

  it('updates a path already stored, and every pinned label carrying the word', () => {
    const stored: PathProgressRecord = {
      labelId: 'pinned',
      language: 'zh',
      stepAttempts: { listen: { b: true } },
    };

    const { paths } = pathsAfterAnswer(
      input({
        answer: { cardId: 'c', exercise: 'listenMeaning', outcome: 'wrong' },
        paths: [stored],
      }),
      PATH_CONFIG,
    );

    expect(paths).toEqual([
      { labelId: 'pinned', language: 'zh', stepAttempts: { listen: { b: true, c: false } } },
      { labelId: 'second', language: 'zh', stepAttempts: { listen: { c: false } } },
    ]);
  });

  it('leaves the labels not pinned alone', () => {
    const { paths } = pathsAfterAnswer(input({ labels: [label('pinned', false)] }), PATH_CONFIG);

    expect(paths).toEqual([]);
  });

  it('validates a step met by the answer and returns its event', () => {
    const introducedStates = ['a', 'b', 'c'].map((cardId) => ({
      ...createInitialReviewState(cardId, new Date('2026-11-01T08:00:00Z')),
      reps: 1,
    }));

    const { paths, events } = pathsAfterAnswer(
      input({
        answer: { cardId: 'c', exercise: 'discovery', outcome: 'correct' },
        labels: [label('pinned', true)],
        states: introducedStates,
      }),
      PATH_CONFIG,
    );

    expect(paths[0]?.steps).toEqual({ discover: 'validated' });
    expect(events).toEqual([
      expect.objectContaining({ labelId: 'pinned', language: 'zh', step: 'discover' }),
    ]);
  });

  it('stores nothing for an answer that changes no path', () => {
    const { paths, events } = pathsAfterAnswer(
      input({ answer: { cardId: 'a', exercise: 'typeMeaning', outcome: 'correct' } }),
      PATH_CONFIG,
    );

    expect(paths).toEqual([]);
    expect(events).toEqual([]);
  });

  it('accepts an answer stored without its exercise, as older results were', () => {
    expect(
      pathsAfterAnswer(input({ answer: { cardId: 'a', outcome: 'good' } }), PATH_CONFIG).paths,
    ).toEqual([]);
  });

  it('ignores an answer on an unknown word', () => {
    expect(
      pathsAfterAnswer(
        input({ answer: { cardId: 'gone', exercise: 'listenMeaning', outcome: 'correct' } }),
        PATH_CONFIG,
      ),
    ).toEqual({ paths: [], events: [] });
  });

  it('keeps the paths of the words of each language apart', () => {
    const { paths } = pathsAfterAnswer(
      input({ answer: { cardId: 'd', exercise: 'typeEcho', outcome: 'correct' } }),
      PATH_CONFIG,
    );

    expect(paths).toEqual([
      { labelId: 'pinned', language: 'en', stepAttempts: { type: { d: true } } },
    ]);
  });
  it('passes the words that suit toneEcho on to the recognize step', () => {
    const stored: PathProgressRecord = {
      labelId: 'second',
      language: 'zh',
      steps: { discover: 'validated', listen: 'validated' },
    };
    const config = { ...PATH_CONFIG, toneEchoMinEligibleWords: 1 };
    const answer = { cardId: 'c', exercise: 'bridgeMatch' as const, outcome: 'correct' as const };
    const withoutToneEcho = input({ answer, paths: [stored], toneEchoEligible: () => false });
    const withToneEcho = input({ answer, paths: [stored], toneEchoEligible: () => true });

    expect(pathsAfterAnswer(withoutToneEcho, config).events.map(({ step }) => step)).toEqual([
      'recognize',
    ]);
    expect(pathsAfterAnswer(withToneEcho, config).events).toEqual([]);
  });
});
