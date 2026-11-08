import { describe, expect, it, vi } from 'vitest';
import type { Card } from '../../domain/card';
import type { Label } from '../../domain/label';
import type { PathProgressRecord, SessionResultRecord } from '../../domain/progressRecords';
import { GAME_CONFIG } from '../../domain/srs/config';
import type { SrsDependencies } from '../../domain/srs/dependencies';
import { createInitialReviewState } from '../../domain/srs/reviewState';
import { beginPlacement, finishPlacement, loadPath, type PathStore } from './pathSession';

function card(id: string, language: Card['language'] = 'zh', labelIds = ['lesson']): Card {
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

const label: Label = {
  id: 'lesson',
  name: 'Leçon 7',
  isFocus: true,
  createdAt: '2026-11-01T08:00:00.000Z',
  updatedAt: '2026-11-01T08:00:00.000Z',
};
const cards = [card('a'), card('b'), card('c'), card('en1', 'en'), card('x', 'zh', ['other'])];
const now = new Date('2026-11-07T10:00:00.000Z');

const srs: SrsDependencies = {
  config: GAME_CONFIG,
  model: {
    review: () => {
      throw new Error('not used');
    },
    retrievability: (state) => (state.cardId === 'b' ? 0.1 : 0.8),
  },
};

function store(path?: PathProgressRecord, results: SessionResultRecord[] = []) {
  return {
    load: vi.fn().mockResolvedValue({
      reviewStates: ['a', 'b'].map((cardId) => ({
        ...createInitialReviewState(cardId, new Date(0)),
        reps: 1,
      })),
      recentSessions: [],
      progress: { lastActiveDate: '2026-11-07' },
    }),
    pathProgress: vi.fn().mockResolvedValue(path),
    resultsSince: vi.fn().mockResolvedValue(results),
    applyPlacementTest: vi.fn().mockResolvedValue([]),
  } satisfies PathStore;
}

const deps = (from: PathStore) => ({ store: from, srs, clock: () => now, newId: () => 'seed' });

describe('loadPath', () => {
  it('computes the path of the label from its words of the language only', async () => {
    const from = store();

    const loaded = await loadPath({ cards, label, language: 'zh' }, deps(from));

    expect(from.pathProgress).toHaveBeenCalledWith('lesson', 'zh');
    expect(loaded.words.map(({ id }) => id)).toEqual(['a', 'b', 'c']);
    expect(loaded.view.current).toBe('discover');
    expect(loaded.view.steps[0]).toMatchObject({ done: 2, total: 3 });
  });

  it('picks the words of a step session, least remembered first', async () => {
    const path: PathProgressRecord = {
      labelId: 'lesson',
      language: 'zh',
      steps: { discover: 'validated' },
      stepAttempts: { listen: { c: true } },
    };

    const loaded = await loadPath({ cards, label, language: 'zh' }, deps(store(path)));

    expect(loaded.stepWords('listen')).toEqual(['b', 'a']);
  });
});

describe('a placement test', () => {
  it('draws different words of the label', async () => {
    const loaded = await loadPath({ cards, label, language: 'zh' }, deps(store()));

    expect([...loaded.placementWords('listen')].sort()).toEqual(['a', 'b', 'c']);
  });

  it('remembers when it started', () => {
    const test = { step: 'listen' as const, cardIds: ['a'] };

    expect(beginPlacement({ labelId: 'lesson', language: 'zh' }, test, () => now)).toEqual({
      labelId: 'lesson',
      language: 'zh',
      test,
      startedAt: now.toISOString(),
    });
  });

  it('is scored on the answers given since it started, then stored', async () => {
    const results: SessionResultRecord[] = ['a', 'b', 'c'].map((cardId) => ({
      cardId,
      exercise: 'listenMeaning',
      outcome: 'correct',
    }));
    const from = store(
      { labelId: 'lesson', language: 'zh', steps: { discover: 'validated', listen: 'validated' } },
      results,
    );
    from.applyPlacementTest.mockResolvedValue([
      {
        type: 'PathStepValidated',
        labelId: 'lesson',
        language: 'zh',
        step: 'listen',
        via: 'placementTest',
      },
    ]);
    const pending = {
      labelId: 'lesson',
      language: 'zh' as const,
      test: { step: 'listen' as const, cardIds: ['a', 'b', 'c'] },
      startedAt: '2026-11-07T09:00:00.000Z',
    };

    const outcome = await finishPlacement(pending, deps(from));

    expect(from.resultsSince).toHaveBeenCalledWith('2026-11-07T09:00:00.000Z');
    const score = { step: 'listen', correct: 3, total: 3, passed: true };
    expect(from.applyPlacementTest).toHaveBeenCalledWith('lesson', 'zh', score, '2026-11-07');
    expect(outcome).toEqual({ ...score, validated: true });
  });

  it('tells a failed test, which validates nothing', async () => {
    const pending = {
      labelId: 'lesson',
      language: 'zh' as const,
      test: { step: 'listen' as const, cardIds: ['a', 'b'] },
      startedAt: '2026-11-07T09:00:00.000Z',
    };

    expect(await finishPlacement(pending, deps(store()))).toEqual({
      step: 'listen',
      correct: 0,
      total: 2,
      passed: false,
      validated: false,
    });
  });

  it('tells the step validated when the answers of the test already validated it', async () => {
    const results: SessionResultRecord[] = ['a', 'b', 'c'].map((cardId) => ({
      cardId,
      exercise: 'listenMeaning',
      outcome: 'correct',
    }));
    const from = store(
      { labelId: 'lesson', language: 'zh', steps: { discover: 'validated', listen: 'validated' } },
      results,
    );
    const pending = {
      labelId: 'lesson',
      language: 'zh' as const,
      test: { step: 'listen' as const, cardIds: ['a', 'b', 'c'] },
      startedAt: '2026-11-07T09:00:00.000Z',
    };

    expect(await finishPlacement(pending, deps(from))).toMatchObject({
      passed: true,
      validated: true,
    });
  });
});
