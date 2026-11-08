import { describe, expect, it } from 'vitest';
import type { Card } from '../card';
import type { PathProgressRecord } from '../progressRecords';
import { createInitialReviewState, type ReviewState } from '../srs/reviewState';
import { advancePath } from './advancePath';
import { PATH_CONFIG } from './pathConfig';

function card(id: string): Card {
  return {
    id,
    language: 'en',
    term: `word ${id}`,
    translation: `mot ${id}`,
    labelIds: ['lesson'],
    source: 'manual',
    createdAt: '2026-11-01T08:00:00.000Z',
    updatedAt: '2026-11-01T08:00:00.000Z',
  };
}

const cards = ['a', 'b', 'c'].map(card);
const introduced = (cardId: string): ReviewState => ({
  ...createInitialReviewState(cardId, new Date('2026-11-01T08:00:00Z')),
  reps: 1,
});
const empty: PathProgressRecord = { labelId: 'lesson', language: 'en' };
const allRight = { a: true, b: true, c: true };

describe('advancePath', () => {
  it('changes nothing while the current step is not met', () => {
    const advanced = advancePath(
      { cards, states: [introduced('a')], progress: empty },
      PATH_CONFIG,
    );

    expect(advanced).toEqual({ progress: empty, events: [] });
  });

  it('validates the current step once met, and tells the game', () => {
    const advanced = advancePath(
      { cards, states: cards.map(({ id }) => introduced(id)), progress: empty },
      PATH_CONFIG,
    );

    expect(advanced.progress.steps).toEqual({ discover: 'validated' });
    expect(advanced.events).toEqual([
      {
        type: 'PathStepValidated',
        labelId: 'lesson',
        language: 'en',
        step: 'discover',
        via: 'progress',
      },
    ]);
  });

  it('never validates a later step before the current one, even when its words are right', () => {
    const progress = { ...empty, stepAttempts: { type: allRight } };

    const advanced = advancePath({ cards, states: [], progress }, PATH_CONFIG);

    expect(advanced.events).toEqual([]);
  });

  it('validates the following steps already met in a row, once the earlier one is', () => {
    const progress = { ...empty, stepAttempts: { listen: allRight, recognize: allRight } };

    const advanced = advancePath(
      { cards, states: cards.map(({ id }) => introduced(id)), progress },
      PATH_CONFIG,
    );

    expect(advanced.events.map(({ step }) => step)).toEqual(['discover', 'listen', 'recognize']);
    expect(advanced.progress.steps).toEqual({
      discover: 'validated',
      listen: 'validated',
      recognize: 'validated',
    });
  });

  it('jumps over the skipped sentences step without an event, and stops at the final challenge', () => {
    const progress: PathProgressRecord = {
      ...empty,
      steps: {
        discover: 'validated',
        listen: 'validated',
        recognize: 'validated',
        type: 'validated',
      },
      stepAttempts: { dictation: allRight },
    };

    const advanced = advancePath({ cards, states: [], progress }, PATH_CONFIG);

    expect(advanced.events.map(({ step }) => step)).toEqual(['dictation']);
    expect(advanced.progress.steps?.sentences).toBeUndefined();
    expect(advanced.progress.steps?.finalChallenge).toBeUndefined();
  });
});
