// @vitest-environment node
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ReviewStateRecord, SessionRecord } from '../domain/progressRecords';
import type { AnswerMode } from '../domain/studySettings';
import { SINGLETON_KEY, VocabularyDatabase } from './database';
import { StudyRepository } from './studyRepository';

function reviewState(cardId: string, reps = 1): ReviewStateRecord {
  return {
    cardId,
    due: '2026-11-06T12:00:00.000Z',
    stability: 1,
    difficulty: 5,
    reps,
    lapses: 0,
    state: 'review',
    successDays: 1,
    peakStage: 'sprout',
  };
}

function session(id: string, startedAt: string): SessionRecord {
  return { id, language: 'zh', startedAt, results: [], labelIds: [], mode: 'flashcards' };
}

let repository: StudyRepository;
let db: VocabularyDatabase;
let databaseCount = 0;

beforeEach(() => {
  databaseCount += 1;
  const name = `study-test-${String(databaseCount)}`;
  repository = new StudyRepository(name);
  db = new VocabularyDatabase(name);
});

afterEach(async () => {
  db.close();
  await repository.deleteDatabase();
});

describe('StudyRepository', () => {
  it('reads an empty progress in a new profile', async () => {
    expect(await repository.load('2026-11-01T00:00:00.000Z')).toEqual({
      reviewStates: [],
      recentSessions: [],
    });
  });

  it('reads the review states, settings, progress and the sessions started since a date', async () => {
    await db.reviewStates.bulkAdd([reviewState('a'), reviewState('b')]);
    await db.progress.put({ lastActiveDate: '2026-11-05' }, SINGLETON_KEY);
    await db.settings.put({ newPerDay: 8 }, SINGLETON_KEY);
    await repository.startSession(session('old', '2026-10-01T08:00:00.000Z'));
    await repository.startSession(session('recent', '2026-11-05T08:00:00.000Z'));

    const data = await repository.load('2026-11-04T00:00:00.000Z');

    expect(data.reviewStates.map(({ cardId }) => cardId).sort()).toEqual(['a', 'b']);
    expect(data.progress).toEqual({ lastActiveDate: '2026-11-05' });
    expect(data.settings).toEqual({ newPerDay: 8 });
    expect(data.recentSessions.map(({ id }) => id)).toEqual(['recent']);
  });

  it('records an answer at once: the new state, the result in its session and the active day', async () => {
    await db.progress.put({ xp: 40, lastActiveDate: '2026-11-05' }, SINGLETON_KEY);
    await repository.startSession(session('s1', '2026-11-06T08:00:00.000Z'));
    const result = { cardId: 'a', outcome: 'correct' as const, at: '2026-11-06T08:01:00.000Z' };

    await repository.recordAnswer({
      sessionId: 's1',
      state: reviewState('a', 2),
      result,
      activeDay: '2026-11-06',
    });

    expect(await db.reviewStates.get('a')).toEqual(reviewState('a', 2));
    expect((await db.sessions.get('s1'))?.results).toEqual([result]);
    expect(await db.progress.get(SINGLETON_KEY)).toEqual({ xp: 40, lastActiveDate: '2026-11-06' });
  });

  it('records an answer the FSRS does not rate without touching the review states', async () => {
    await db.reviewStates.put(reviewState('a', 2));
    await repository.startSession(session('s1', '2026-11-06T08:00:00.000Z'));
    const result = { cardId: 'a', outcome: 'correct' as const, exercise: 'toneEcho' as const };

    await repository.recordAnswer({ sessionId: 's1', result, activeDay: '2026-11-06' });

    expect(await db.reviewStates.toArray()).toEqual([reviewState('a', 2)]);
    expect((await db.sessions.get('s1'))?.results).toEqual([result]);
    expect(await db.progress.get(SINGLETON_KEY)).toEqual({ lastActiveDate: '2026-11-06' });
  });

  it('applies the game to the stored progress and settings in the same write as the answer', async () => {
    await db.progress.put({ xp: 40, lastActiveDate: '2026-11-05' }, SINGLETON_KEY);
    await db.settings.put({ dailyGoalXp: 150 }, SINGLETON_KEY);
    await repository.startSession(session('s1', '2026-11-06T08:00:00.000Z'));

    await repository.recordAnswer({
      sessionId: 's1',
      state: reviewState('a', 2),
      result: { cardId: 'a', outcome: 'correct' },
      activeDay: '2026-11-06',
      progress: ({ progress, settings }) => ({
        ...progress,
        xp: (progress.xp ?? 0) + 10,
        dailyXp: settings?.dailyGoalXp ?? 0,
      }),
    });

    expect(await db.progress.get(SINGLETON_KEY)).toEqual({
      xp: 50,
      dailyXp: 150,
      lastActiveDate: '2026-11-06',
    });
  });

  it('starts the game from an empty progress in a new profile', async () => {
    await repository.startSession(session('s1', '2026-11-06T08:00:00.000Z'));

    await repository.recordAnswer({
      sessionId: 's1',
      state: reviewState('a'),
      result: { cardId: 'a', outcome: 'correct' },
      activeDay: '2026-11-06',
      progress: ({ progress }) => ({ ...progress, xp: 10 }),
    });

    expect(await db.progress.get(SINGLETON_KEY)).toEqual({ xp: 10, lastActiveDate: '2026-11-06' });
  });

  it('keeps every answer of a session, in order', async () => {
    await repository.startSession(session('s1', '2026-11-06T08:00:00.000Z'));
    for (const cardId of ['a', 'b']) {
      await repository.recordAnswer({
        sessionId: 's1',
        state: reviewState(cardId),
        result: { cardId, outcome: 'wrong' },
        activeDay: '2026-11-06',
      });
    }

    expect((await db.sessions.get('s1'))?.results.map(({ cardId }) => cardId)).toEqual(['a', 'b']);
  });

  it('records nothing when the session is unknown, rather than a stray state', async () => {
    await expect(
      repository.recordAnswer({
        sessionId: 'missing',
        state: reviewState('a'),
        result: { cardId: 'a', outcome: 'wrong' },
        activeDay: '2026-11-06',
        progress: () => ({ xp: 999 }),
      }),
    ).rejects.toThrow('Unknown session: missing');

    expect(await db.reviewStates.count()).toBe(0);
    expect(await db.progress.get(SINGLETON_KEY)).toBeUndefined();
  });

  it('replaces the last answer of a word when it is revised, keeping a single result', async () => {
    await repository.startSession(session('s1', '2026-11-06T08:00:00.000Z'));
    const answer = (cardId: string, outcome: 'wrong' | 'correct', reps: number) => ({
      sessionId: 's1',
      state: reviewState(cardId, reps),
      result: { cardId, outcome },
      activeDay: '2026-11-06',
    });
    await repository.recordAnswer(answer('a', 'wrong', 2));
    await repository.recordAnswer(answer('b', 'wrong', 2));

    await repository.reviseAnswer(answer('a', 'correct', 4));

    expect((await db.sessions.get('s1'))?.results).toEqual([
      { cardId: 'a', outcome: 'correct' },
      { cardId: 'b', outcome: 'wrong' },
    ]);
    expect(await db.reviewStates.get('a')).toEqual(reviewState('a', 4));
  });

  it('refuses to revise an answer the session does not hold, leaving the state alone', async () => {
    await repository.startSession(session('s1', '2026-11-06T08:00:00.000Z'));

    await expect(
      repository.reviseAnswer({
        sessionId: 's1',
        state: reviewState('a', 9),
        result: { cardId: 'a', outcome: 'correct' },
        activeDay: '2026-11-06',
      }),
    ).rejects.toThrow('No answer to revise for a in session s1');
    expect(await db.reviewStates.count()).toBe(0);
  });

  it('revises a free practice answer in its session only', async () => {
    await db.reviewStates.put(reviewState('a', 3));
    await repository.startSession({
      ...session('p1', '2026-11-06T08:00:00.000Z'),
      mode: 'practice',
    });
    await repository.recordPracticeAnswer({
      sessionId: 'p1',
      result: { cardId: 'a', outcome: 'wrong' },
    });

    await repository.revisePracticeAnswer({
      sessionId: 'p1',
      result: { cardId: 'a', outcome: 'correct' },
    });

    expect((await db.sessions.get('p1'))?.results).toEqual([{ cardId: 'a', outcome: 'correct' }]);
    expect(await db.reviewStates.get('a')).toEqual(reviewState('a', 3));
  });

  it('reads the review states alone, for the word list and the label gauges', async () => {
    await db.reviewStates.bulkAdd([reviewState('a'), reviewState('b')]);

    expect((await repository.reviewStates()).map(({ cardId }) => cardId).sort()).toEqual([
      'a',
      'b',
    ]);
  });

  it('marks a session as ended', async () => {
    await repository.startSession(session('s1', '2026-11-06T08:00:00.000Z'));

    await repository.endSession('s1', '2026-11-06T08:10:00.000Z');

    expect((await db.sessions.get('s1'))?.endedAt).toBe('2026-11-06T08:10:00.000Z');
  });

  it('records a free practice answer in its session only: review state and progress unchanged', async () => {
    await db.reviewStates.put(reviewState('a', 3));
    await db.progress.put({ lastActiveDate: '2026-11-05' }, SINGLETON_KEY);
    await repository.startSession({
      ...session('p1', '2026-11-06T08:00:00.000Z'),
      mode: 'practice',
    });
    const result = { cardId: 'a', outcome: 'correct' as const, at: '2026-11-06T08:01:00.000Z' };

    await repository.recordPracticeAnswer({ sessionId: 'p1', result });

    expect((await db.sessions.get('p1'))?.results).toEqual([result]);
    expect(await db.reviewStates.get('a')).toEqual(reviewState('a', 3));
    expect(await db.progress.get(SINGLETON_KEY)).toEqual({ lastActiveDate: '2026-11-05' });
  });

  it('gives the points of a free practice answer without making the day an active one', async () => {
    await db.progress.put({ xp: 5, lastActiveDate: '2026-11-05' }, SINGLETON_KEY);
    await repository.startSession({
      ...session('p1', '2026-11-06T08:00:00.000Z'),
      mode: 'practice',
    });

    await repository.recordPracticeAnswer({
      sessionId: 'p1',
      result: { cardId: 'a', outcome: 'correct' },
      progress: ({ progress }) => ({ ...progress, xp: (progress.xp ?? 0) + 10 }),
    });

    expect(await db.progress.get(SINGLETON_KEY)).toEqual({ xp: 15, lastActiveDate: '2026-11-05' });
  });

  it('stores the progress of a finished session alone', async () => {
    await db.progress.put({ xp: 5 }, SINGLETON_KEY);
    await db.settings.put({ dailyGoalXp: 450 }, SINGLETON_KEY);

    await repository.recordProgress(({ progress, settings }) => ({
      ...progress,
      dailyXp: settings?.dailyGoalXp ?? 0,
    }));

    expect(await db.progress.get(SINGLETON_KEY)).toEqual({ xp: 5, dailyXp: 450 });
  });

  it('refuses a free practice answer for an unknown session', async () => {
    await expect(
      repository.recordPracticeAnswer({
        sessionId: 'missing',
        result: { cardId: 'a', outcome: 'wrong' },
      }),
    ).rejects.toThrow('Unknown session: missing');
  });

  it('saves the daily quota of new words and keeps the other settings', async () => {
    await db.settings.put({ ttsRate: 0.85, newPerDay: 5 }, SINGLETON_KEY);

    await repository.saveNewPerDay(10);

    expect(await db.settings.get(SINGLETON_KEY)).toEqual({ ttsRate: 0.85, newPerDay: 10 });
    expect((await repository.load('2026-11-01T00:00:00.000Z')).settings?.newPerDay).toBe(10);
  });

  it('saves the daily quota in a new profile without settings', async () => {
    await repository.saveNewPerDay(8);

    expect(await db.settings.get(SINGLETON_KEY)).toEqual({ newPerDay: 8 });
  });

  it('saves the way of answering the flashcards and keeps the other settings', async () => {
    await repository.saveNewPerDay(10);

    await repository.saveAnswerMode('typeMeaning');

    expect(await db.settings.get(SINGLETON_KEY)).toEqual({
      newPerDay: 10,
      answerMode: 'typeMeaning',
    });
  });

  it('refuses to store an unknown way of answering', async () => {
    await expect(repository.saveAnswerMode('<script>' as AnswerMode)).rejects.toThrow(RangeError);
    expect(await db.settings.get(SINGLETON_KEY)).toBeUndefined();
  });

  it('remembers the intensive mode chosen for a test, label by label, keeping the rest', async () => {
    await repository.saveNewPerDay(10);

    await repository.saveIntensiveExamMode('lesson-7', true);
    await repository.saveIntensiveExamMode('lesson-8', true);
    await repository.saveIntensiveExamMode('lesson-8', false);

    expect(await db.settings.get(SINGLETON_KEY)).toEqual({
      newPerDay: 10,
      intensiveExamMode: { 'lesson-7': true, 'lesson-8': false },
    });
  });

  it.each(['__proto__', 'constructor', '<b>x</b>', ''])(
    'refuses to store the intensive mode under the key %j',
    async (labelId) => {
      await expect(repository.saveIntensiveExamMode(labelId, true)).rejects.toThrow(RangeError);
      expect(await db.settings.get(SINGLETON_KEY)).toBeUndefined();
    },
  );

  it('saves the speed of the voice and keeps the other settings', async () => {
    await repository.saveNewPerDay(10);

    await repository.saveTtsRate(0.5);

    expect(await db.settings.get(SINGLETON_KEY)).toEqual({ newPerDay: 10, ttsRate: 0.5 });
  });

  it('refuses to store a speech rate of no speed', async () => {
    await expect(repository.saveTtsRate(3)).rejects.toThrow(RangeError);
    await expect(repository.saveTtsRate(Number.NaN)).rejects.toThrow(RangeError);
    expect(await db.settings.get(SINGLETON_KEY)).toBeUndefined();
  });

  it('refuses to store a daily quota out of range', async () => {
    await expect(repository.saveNewPerDay(0)).rejects.toThrow(RangeError);
    await expect(repository.saveNewPerDay(Number.NaN)).rejects.toThrow(RangeError);
    expect(await db.settings.get(SINGLETON_KEY)).toBeUndefined();
  });
});
