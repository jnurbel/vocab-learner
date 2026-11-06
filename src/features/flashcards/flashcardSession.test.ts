import { describe, expect, it } from 'vitest';
import type { Card } from '../../domain/card';
import type { SessionRecord } from '../../domain/progressRecords';
import { card, FakeStore, reviewed, srs } from './flashcards.fixtures';
import { loadStudyOutlook, startFlashcardSession, type FlashcardStore } from './flashcardSession';

const morning = new Date('2026-11-06T08:00:00Z');

function start(store: FlashcardStore, cards: Card[], clock = () => morning) {
  return startFlashcardSession(
    { cards, language: 'zh', labelIds: [] },
    { store, srs, clock, newId: () => 'session-1' },
  );
}

describe('a flashcard session', () => {
  it('shows the due words first, then the new words, and counts its progress', async () => {
    const store = new FakeStore({ reviewStates: [reviewed('due')] });

    const session = await start(store, [card('new'), card('due')]);

    expect(session.items.map(({ card: { id }, kind }) => [id, kind])).toEqual([
      ['due', 'review'],
      ['new', 'new'],
    ]);
    expect(session.current?.card.id).toBe('due');
    expect(session.position).toBe(0);
    expect(session.total).toBe(2);
  });

  it('stores an answer with its new state, its result and the day of the session', async () => {
    const store = new FakeStore({ reviewStates: [reviewed('due')] });
    const session = await start(store, [card('due')]);

    await session.answer('good');

    expect(store.sessions[0]).toMatchObject({
      id: 'session-1',
      language: 'zh',
      mode: 'flashcards',
    });
    const [answer] = store.answers;
    expect(answer?.sessionId).toBe('session-1');
    expect(answer?.activeDay).toBe('2026-11-06');
    expect(answer?.state.lastRatedDay).toBe('2026-11-06');
    expect(answer?.state.reps).toBe(4);
    expect(answer?.result).toEqual({
      cardId: 'due',
      outcome: 'correct',
      exercise: 'audioFlashcard',
      rating: 'good',
      hintsUsed: 0,
      at: '2026-11-06T08:00:00.000Z',
    });
    expect(session.position).toBe(1);
  });

  it('rates a known answer as hard when the pinyin was revealed', async () => {
    const store = new FakeStore({ reviewStates: [reviewed('due')] });
    const session = await start(store, [card('due')]);

    await session.answer('good', { hintsUsed: 1 });

    expect(store.answers[0]?.result).toMatchObject({
      outcome: 'correct',
      rating: 'hard',
      hintsUsed: 1,
    });
  });

  it('maps the self-evaluation to the outcomes "wrong" and "correct with hint"', async () => {
    const store = new FakeStore({ reviewStates: [reviewed('a'), reviewed('b')] });
    const session = await start(store, [card('a'), card('b')]);

    await session.answer('again');
    await session.answer('hard');

    expect(store.answers.map(({ result }) => [result.outcome, result.rating])).toEqual([
      ['wrong', 'again'],
      ['correctWithHint', 'hard'],
    ]);
  });

  it('records a new word as discovered, and "I already know it" as an easy answer', async () => {
    const store = new FakeStore();
    const session = await start(store, [card('new')]);

    await session.answer('known');

    expect(store.answers[0]?.result).toMatchObject({
      exercise: 'discovery',
      outcome: 'correct',
      rating: 'easy',
    });
  });

  it('refuses "I already know it" for a word already reviewed', async () => {
    const store = new FakeStore({ reviewStates: [reviewed('due')] });
    const session = await start(store, [card('due')]);

    await expect(session.answer('known')).rejects.toThrow('only for a new word');
    expect(store.answers).toEqual([]);
    expect(session.position).toBe(0);
  });

  it('introduces only what is left of the daily quota of new words', async () => {
    const earlier: SessionRecord = {
      id: 'earlier',
      language: 'zh',
      startedAt: '2026-11-06T07:00:00.000Z',
      results: ['x1', 'x2', 'x3', 'x4'].map((cardId) => ({
        cardId,
        outcome: 'correct' as const,
        exercise: 'discovery' as const,
        at: '2026-11-06T07:01:00.000Z',
      })),
    };
    const store = new FakeStore({ recentSessions: [earlier], settings: { newPerDay: 5 } });
    const cards = ['n1', 'n2', 'n3'].map((id, index) =>
      card(id, `2026-10-0${String(index + 1)}T00:00:00.000Z`),
    );

    const session = await start(store, cards);

    expect(session.items.map(({ card: { id } }) => id)).toEqual(['n1']);
    expect(store.loadedSince).toBe('2026-11-04T08:00:00.000Z');
  });

  it('keeps the day it started with, even when the answer comes after the next day began', async () => {
    const store = new FakeStore({ reviewStates: [reviewed('due')] });
    let now = new Date('2026-11-06T22:00:00Z');
    const session = await start(store, [card('due')], () => now);

    now = new Date('2026-11-07T05:00:00Z'); // 06:00 in Paris: the next day
    await session.answer('good');

    expect(store.answers[0]?.activeDay).toBe('2026-11-06');
    expect(store.answers[0]?.state.lastRatedDay).toBe('2026-11-06');
  });

  it('never starts before the last active day when the clock went back', async () => {
    const store = new FakeStore({ progress: { lastActiveDate: '2026-11-09' } });

    const session = await start(store, [card('new')]);
    await session.answer('good');

    expect(session.today).toBe('2026-11-09');
    expect(store.answers[0]?.activeDay).toBe('2026-11-09');
  });

  it('does not start an empty session when nothing is due', async () => {
    const ratedToday = reviewed('due', { lastRatedDay: '2026-11-06' });
    const store = new FakeStore({ reviewStates: [ratedToday] });

    const session = await start(store, [card('due')]);

    expect(session.items).toEqual([]);
    expect(session.finished).toBe(true);
    expect(store.sessions).toEqual([]);
  });

  it('ends once every card is answered, with what was reviewed, discovered and grew', async () => {
    const store = new FakeStore({ reviewStates: [reviewed('due', { successDays: 1 })] });
    const session = await start(store, [card('due'), card('new')]);

    await session.answer('good');
    expect(session.finished).toBe(false);
    await session.answer('good');

    expect(session.finished).toBe(true);
    expect(session.current).toBeUndefined();
    expect(store.sessions[0]?.endedAt).toBe('2026-11-06T08:00:00.000Z');
    const summary = session.summary();
    expect(summary.reviewed).toBe(1);
    expect(summary.introduced).toBe(1);
    expect(summary.stageChanges.map(({ card: { id }, from, to }) => [id, from, to])).toEqual([
      ['due', 'sprout', 'stem'],
      ['new', 'seed', 'sprout'],
    ]);
  });

  it('can be left at any time, everything answered being already stored', async () => {
    const store = new FakeStore({ reviewStates: [reviewed('a'), reviewed('b')] });
    const session = await start(store, [card('a'), card('b')]);
    await session.answer('again');

    await session.quit();

    expect(store.answers).toHaveLength(1);
    expect(store.sessions[0]?.endedAt).toBe('2026-11-06T08:00:00.000Z');
    expect(session.finished).toBe(true);
    expect(session.summary().reviewed).toBe(1);
  });

  it('stores no session when left before the first answer', async () => {
    const store = new FakeStore({ reviewStates: [reviewed('a')] });
    const session = await start(store, [card('a')]);

    await session.quit();

    expect(store.sessions).toEqual([]);
    expect(session.summary()).toEqual({ reviewed: 0, introduced: 0, stageChanges: [] });
  });

  it('refuses an answer once finished', async () => {
    const session = await start(new FakeStore(), []);

    await expect(session.answer('good')).rejects.toThrow('finished');
  });
});

describe('the study outlook', () => {
  it('explains the queue of the selection from the stored progress and the daily quota', async () => {
    const earlier: SessionRecord = {
      id: 'earlier',
      language: 'zh',
      startedAt: '2026-11-06T07:00:00.000Z',
      results: [
        { cardId: 'x', outcome: 'correct', exercise: 'discovery', at: '2026-11-06T07:01:00.000Z' },
      ],
    };
    const store = new FakeStore({
      reviewStates: [reviewed('due'), reviewed('done', { lastRatedDay: '2026-11-06' })],
      recentSessions: [earlier],
      settings: { newPerDay: 3 },
    });
    const cards = [card('due'), card('done'), card('n1'), card('n2'), card('n3')];

    const outlook = await loadStudyOutlook(
      { cards, language: 'zh', labelIds: [] },
      { store, srs, clock: () => morning },
    );

    expect(outlook).toMatchObject({
      dueToday: 1,
      reviewedToday: 1,
      newAvailableToday: 2,
      newWaiting: 1,
      newPerDay: 3,
      today: '2026-11-06',
    });
  });
});
