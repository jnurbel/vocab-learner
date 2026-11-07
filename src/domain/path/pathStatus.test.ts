import { describe, expect, it } from 'vitest';
import type { Card } from '../card';
import type { PathProgressRecord, PathStep } from '../progressRecords';
import { createInitialReviewState, type ReviewState } from '../srs/reviewState';
import { PATH_CONFIG } from './pathConfig';
import { pathStatus, requiredWords, type PathInput } from './pathStatus';

function card(id: string, extra: Partial<Card> = {}): Card {
  return {
    id,
    language: 'zh',
    term: `词${id}`,
    translation: `mot ${id}`,
    labelIds: ['lesson'],
    source: 'manual',
    createdAt: '2026-11-01T08:00:00.000Z',
    updatedAt: '2026-11-01T08:00:00.000Z',
    ...extra,
  };
}

function introduced(cardId: string): ReviewState {
  return { ...createInitialReviewState(cardId, new Date('2026-11-01T08:00:00Z')), reps: 1 };
}

const words = ['a', 'b', 'c', 'd', 'e'].map((id) => card(id));
const allRight = Object.fromEntries(words.map(({ id }) => [id, true]));

function input(progress?: PathProgressRecord, extra: Partial<PathInput> = {}): PathInput {
  return {
    cards: words,
    states: [],
    ...(progress === undefined ? {} : { progress }),
    toneEchoEligible: () => false,
    ...extra,
  };
}

function path(
  steps: PathProgressRecord['steps'],
  more: Partial<PathProgressRecord> = {},
): PathProgressRecord {
  return { labelId: 'lesson', language: 'zh', steps, ...more };
}

const statusOf = (view: ReturnType<typeof pathStatus>, step: PathStep) =>
  view.steps.find((candidate) => candidate.step === step);

describe('requiredWords', () => {
  it.each([
    [25, 20],
    [15, 12],
    [5, 4],
    [4, 4],
    [1, 1],
    [0, 0],
  ])('asks, out of %i words, %i at 80 percent', (total, required) => {
    expect(requiredWords(total, 0.8)).toBe(required);
  });
});

describe('pathStatus', () => {
  it('opens on the first step, the others locked or skipped', () => {
    const view = pathStatus(input(), PATH_CONFIG);

    expect(view.current).toBe('discover');
    expect(view.steps.map(({ status }) => status)).toEqual([
      'current',
      'locked',
      'locked',
      'locked',
      'locked',
      'skipped',
      'locked',
    ]);
  });

  it('counts the words introduced for the discover step', () => {
    const view = pathStatus(
      input(undefined, { states: [introduced('a'), introduced('b')] }),
      PATH_CONFIG,
    );

    expect(statusOf(view, 'discover')).toMatchObject({
      done: 2,
      required: 4,
      total: 5,
      met: false,
    });
  });

  it('meets the discover step once 80 percent of the words are introduced', () => {
    const states = ['a', 'b', 'c', 'd'].map(introduced);

    expect(statusOf(pathStatus(input(undefined, { states }), PATH_CONFIG), 'discover')?.met).toBe(
      true,
    );
  });

  it('counts the words whose last attempt in the step was right', () => {
    const progress = path({}, { stepAttempts: { listen: { a: true, b: false, z: true } } });

    expect(statusOf(pathStatus(input(progress), PATH_CONFIG), 'listen')).toMatchObject({
      done: 1,
      total: 5,
    });
  });

  it('makes the first step not yet validated the current one', () => {
    const view = pathStatus(
      input(path({ discover: 'validated', listen: 'validated' })),
      PATH_CONFIG,
    );

    expect(view.current).toBe('recognize');
    expect(view.steps.map(({ status }) => status).slice(0, 4)).toEqual([
      'validated',
      'validated',
      'current',
      'locked',
    ]);
  });

  it('keeps a validated step validated, even when its words were forgotten since', () => {
    const progress = path({ discover: 'validated', listen: 'validated' }, { stepAttempts: {} });

    expect(statusOf(pathStatus(input(progress), PATH_CONFIG), 'listen')?.status).toBe('validated');
  });

  it('skips the sentences step when fewer than 3 words have an example, without blocking', () => {
    const progress = path({
      discover: 'validated',
      listen: 'validated',
      recognize: 'validated',
      type: 'validated',
      dictation: 'validated',
    });
    const view = pathStatus(
      input(progress, { cards: [...words.slice(0, 3), card('x', { example: '我们 词x' })] }),
      PATH_CONFIG,
    );

    expect(statusOf(view, 'sentences')?.status).toBe('skipped');
    expect(view.current).toBe('finalChallenge');
  });

  it('opens the sentences step from 3 words with an example, counted on them only', () => {
    const withExamples = [
      ...words.slice(0, 2),
      ...['x', 'y', 'z'].map((id) => card(id, { example: `例句 ${id}` })),
      card('blank', { example: '   ' }),
    ];
    const progress = path(
      { discover: 'validated', listen: 'validated', recognize: 'validated' },
      { stepAttempts: { sentences: { x: true, a: true } } },
    );

    const sentences = statusOf(
      pathStatus(input(progress, { cards: withExamples }), PATH_CONFIG),
      'sentences',
    );

    expect(sentences).toMatchObject({ status: 'locked', done: 1, required: 3, total: 3 });
  });

  it('meets the sentences step with its words heard and enough sentences put back in order', () => {
    const cards = ['x', 'y', 'z'].map((id) => card(id, { example: `例句 ${id}` }));
    const heard = { sentences: { x: true, y: true, z: true } };
    const missingShuffles = path({}, { stepAttempts: heard, shuffledSentences: { x: true } });
    const enough = path(
      {},
      { stepAttempts: heard, shuffledSentences: { x: true, y: true, z: true } },
    );
    const met = (progress: PathProgressRecord) =>
      statusOf(pathStatus(input(progress, { cards }), PATH_CONFIG), 'sentences')?.met;

    expect(met(missingShuffles)).toBe(false);
    expect(met(enough)).toBe(true);
  });

  it('meets the recognize step on bridgeMatch alone when too few words suit toneEcho', () => {
    const progress = path({}, { stepAttempts: { recognize: allRight } });

    expect(statusOf(pathStatus(input(progress), PATH_CONFIG), 'recognize')?.met).toBe(true);
  });

  it('also asks 80 percent of the last toneEcho items when at least 5 words suit toneEcho', () => {
    const eligible = { toneEchoEligible: () => true };
    const failing = path(
      {},
      { stepAttempts: { recognize: allRight }, toneEchoRecent: [true, true, true, false, false] },
    );
    const passing = path(
      {},
      { stepAttempts: { recognize: allRight }, toneEchoRecent: [true, true, true, true, false] },
    );
    const none = path({}, { stepAttempts: { recognize: allRight } });

    const met = (progress: PathProgressRecord) =>
      statusOf(pathStatus(input(progress, eligible), PATH_CONFIG), 'recognize')?.met;
    expect(met(failing)).toBe(false);
    expect(met(passing)).toBe(true);
    expect(met(none)).toBe(false);
  });

  it('judges toneEcho on pinyin in Chinese by default, and on no word in English', () => {
    const progress = path({}, { stepAttempts: { recognize: allRight } });
    const withPinyin = words.map((word) => ({ ...word, pinyin: 'cí' }));
    const english = words.map((word) => ({ ...word, language: 'en' as const }));
    const met = (cards: Card[]) =>
      statusOf(pathStatus({ cards, states: [], progress }, PATH_CONFIG), 'recognize')?.met;

    expect(met(withPinyin)).toBe(false);
    expect(met(words)).toBe(true);
    expect(met(english)).toBe(true);
  });

  it('shows the best score of the final challenge out of 20, validated from 16', () => {
    const view = pathStatus(input(path({}, { finalChallengeBest: 16 })), PATH_CONFIG);

    expect(statusOf(view, 'finalChallenge')).toMatchObject({
      status: 'validated',
      done: 16,
      required: 16,
      total: 20,
      met: true,
    });
  });

  it('has no current step once every step is validated', () => {
    const steps = Object.fromEntries(
      ['discover', 'listen', 'recognize', 'type', 'dictation', 'sentences', 'finalChallenge'].map(
        (step) => [step, 'validated'],
      ),
    );

    expect(pathStatus(input(path(steps)), PATH_CONFIG).current).toBeUndefined();
  });

  it('never meets a step of a label without words in the language', () => {
    const view = pathStatus(input(undefined, { cards: [] }), PATH_CONFIG);

    expect(statusOf(view, 'discover')).toMatchObject({ done: 0, total: 0, met: false });
  });
});
