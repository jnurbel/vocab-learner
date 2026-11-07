// @vitest-environment node
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Card } from '../domain/card';
import type { Label } from '../domain/label';
import type {
  ExerciseType,
  PathProgressRecord,
  ReviewStateRecord,
  SessionResultRecord,
} from '../domain/progressRecords';
import { SINGLETON_KEY, toStored, VocabularyDatabase } from './database';
import { StudyRepository } from './studyRepository';

function card(id: string, labelIds: string[], extra: Partial<Card> = {}): Card {
  return {
    id,
    language: 'zh',
    term: `词${id}`,
    translation: `mot ${id}`,
    labelIds,
    source: 'manual',
    createdAt: '2026-11-01T08:00:00.000Z',
    updatedAt: '2026-11-01T08:00:00.000Z',
    ...extra,
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

function reviewState(cardId: string, reps = 1): ReviewStateRecord {
  return {
    cardId,
    due: '2026-11-08T12:00:00.000Z',
    stability: 1,
    difficulty: 5,
    reps,
    lapses: 0,
    state: 'review',
    successDays: 1,
    peakStage: 'sprout',
  };
}

function result(
  cardId: string,
  exercise: ExerciseType,
  outcome: SessionResultRecord['outcome'] = 'correct',
): SessionResultRecord {
  return { cardId, exercise, outcome, at: '2026-11-07T09:00:00.000Z' };
}

const day = '2026-11-07';
let repository: StudyRepository;
let db: VocabularyDatabase;
let databaseCount = 0;

beforeEach(async () => {
  databaseCount += 1;
  const name = `study-path-test-${String(databaseCount)}`;
  repository = new StudyRepository(name);
  db = new VocabularyDatabase(name);
  await db.labels.bulkAdd([label('lesson', true), label('loose', false)]);
  await db.cards.bulkAdd(
    [
      card('a', ['lesson'], { example: '例句 a' }),
      card('b', ['lesson'], { example: '例句 b' }),
      card('c', ['lesson', 'loose']),
      card('free', ['loose']),
    ].map(toStored),
  );
  await repository.startSession({
    id: 's1',
    language: 'zh',
    startedAt: '2026-11-07T08:00:00.000Z',
    results: [],
  });
});

afterEach(async () => {
  db.close();
  await repository.deleteDatabase();
});

const lessonPath = () => db.pathProgress.get(['lesson', 'zh']);

async function answer(cardId: string, exercise: ExerciseType, reps = 1) {
  await repository.recordAnswer({
    sessionId: 's1',
    state: reviewState(cardId, reps),
    result: result(cardId, exercise),
    activeDay: day,
  });
}

describe('StudyRepository and the label paths', () => {
  it.each<[ExerciseType, Partial<PathProgressRecord>]>([
    ['bridgeMatch', { stepAttempts: { recognize: { a: true } } }],
    ['toneEcho', { toneEchoRecent: [true] }],
    ['sentenceListen', { stepAttempts: { sentences: { a: true } } }],
    ['sentenceShuffle', { shuffledSentences: { a: true } }],
    ['listenMeaning', { stepAttempts: { listen: { a: true } } }],
    ['typeEcho', { stepAttempts: { type: { a: true } } }],
    ['listenType', { stepAttempts: { dictation: { a: true } } }],
  ])('feeds the path of the pinned label with an answer in %s', async (exercise, expected) => {
    await answer('a', exercise);

    expect(await lessonPath()).toEqual({ labelId: 'lesson', language: 'zh', ...expected });
  });

  it('keeps no path for a word of no pinned label', async () => {
    await answer('free', 'listenMeaning');

    expect(await db.pathProgress.count()).toBe(0);
  });

  it('feeds the path with free practice answers too', async () => {
    await repository.recordPracticeAnswer({ sessionId: 's1', result: result('b', 'typeEcho') });

    expect((await lessonPath())?.stepAttempts).toEqual({ type: { b: true } });
  });

  it('feeds the path with a revised answer, which replaces the last attempt', async () => {
    await repository.recordAnswer({
      sessionId: 's1',
      state: reviewState('a'),
      result: result('a', 'typeEcho', 'wrong'),
      activeDay: day,
    });

    await repository.reviseAnswer({
      sessionId: 's1',
      state: reviewState('a'),
      result: result('a', 'typeEcho'),
      activeDay: day,
    });

    expect((await lessonPath())?.stepAttempts).toEqual({ type: { a: true } });
  });

  it('validates a step in the same write as the answer, and gives its 50 points', async () => {
    await db.progress.put({ xp: 100, dailyXp: 0, dailyXpDay: day }, SINGLETON_KEY);
    await answer('a', 'discovery');
    await answer('b', 'discovery');

    await answer('c', 'discovery');

    expect((await lessonPath())?.steps).toEqual({ discover: 'validated' });
    expect((await db.progress.get(SINGLETON_KEY))?.xp).toBe(150);
  });

  it('gives the points of a step on top of those of the answer', async () => {
    await answer('a', 'discovery');
    await answer('b', 'discovery');

    await repository.recordAnswer({
      sessionId: 's1',
      state: reviewState('c'),
      result: result('c', 'discovery'),
      activeDay: day,
      progress: ({ progress }) => ({ ...progress, xp: (progress.xp ?? 0) + 10 }),
    });

    expect((await db.progress.get(SINGLETON_KEY))?.xp).toBe(60);
  });

  it('gives the points of a step reached by free practice on the day of the answer', async () => {
    await db.reviewStates.bulkAdd([reviewState('a'), reviewState('b'), reviewState('c')]);
    await db.pathProgress.put({
      labelId: 'lesson',
      language: 'zh',
      steps: { discover: 'validated' },
      stepAttempts: { listen: { a: true, b: true } },
    });

    await repository.recordPracticeAnswer({
      sessionId: 's1',
      result: result('c', 'listenMeaning'),
    });

    expect((await lessonPath())?.steps).toEqual({ discover: 'validated', listen: 'validated' });
    expect(await db.progress.get(SINGLETON_KEY)).toMatchObject({ xp: 50, dailyXpDay: day });
  });

  it('writes no path when the answer cannot be stored', async () => {
    await expect(
      repository.recordAnswer({
        sessionId: 'unknown',
        state: reviewState('a'),
        result: result('a', 'listenMeaning'),
        activeDay: day,
      }),
    ).rejects.toThrow();

    expect(await db.pathProgress.count()).toBe(0);
  });
});
