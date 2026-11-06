import { describe, expect, it } from 'vitest';
import type { Card } from '../../domain/card';
import { card, FakeStore } from '../flashcards/flashcards.fixtures';
import { startPracticeSession } from './practiceSession';

const morning = new Date('2026-11-06T08:00:00Z');

function start(store: FakeStore, cards: Card[], labelIds: string[] = []) {
  return startPracticeSession(
    { cards, language: 'zh', labelIds },
    { store, clock: () => morning, newId: () => 'practice-1' },
  );
}

describe('a free practice session', () => {
  it('offers every word of the selection, shuffled by the session id', () => {
    const store = new FakeStore();
    const cards = [card('a'), card('b'), card('apple', undefined, { language: 'en' })];

    const session = start(store, cards);

    expect(session.items.map(({ card: { id } }) => id).sort()).toEqual(['a', 'b']);
    expect(session.total).toBe(2);
    expect(session.position).toBe(0);
  });

  it('stores an answer in a practice session, with no review state and no FSRS rating', async () => {
    const store = new FakeStore();
    const session = start(store, [card('a', undefined, { labelIds: ['animals'] })], ['animals']);

    await session.answer('good', { hintsUsed: 1 });

    expect(store.sessions[0]).toMatchObject({
      id: 'practice-1',
      language: 'zh',
      labelIds: ['animals'],
      mode: 'practice',
      startedAt: '2026-11-06T08:00:00.000Z',
    });
    expect(store.practiceAnswers).toEqual([
      {
        sessionId: 'practice-1',
        result: {
          cardId: 'a',
          outcome: 'correct',
          exercise: 'audioFlashcard',
          hintsUsed: 1,
          at: '2026-11-06T08:00:00.000Z',
        },
      },
    ]);
    expect(store.answers).toEqual([]);
    expect(session.position).toBe(1);
  });

  it('ends the session after the last answer, and refuses another answer', async () => {
    const store = new FakeStore();
    const session = start(store, [card('a')]);

    await session.answer('again');

    expect(session.finished).toBe(true);
    expect(store.sessions[0]?.endedAt).toBe('2026-11-06T08:00:00.000Z');
    await expect(session.answer('good')).rejects.toThrow('The session is finished');
  });

  it('sums up the words seen, known and to review, "Difficile" counting as to review', async () => {
    const store = new FakeStore();
    const session = start(store, [card('a'), card('b'), card('c')]);
    const [first, second] = session.items;

    await session.answer('again');
    await session.answer('hard');
    await session.answer('good');

    const summary = session.summary();
    expect(summary.seen).toBe(3);
    expect(summary.known).toBe(1);
    expect(summary.toReview).toEqual([first?.card, second?.card]);
  });

  it('can be left early: the answers given are kept and the summary counts them only', async () => {
    const store = new FakeStore();
    const session = start(store, [card('a'), card('b')]);

    await session.answer('again');
    await session.quit();

    expect(session.finished).toBe(true);
    expect(session.current).toBeUndefined();
    expect(store.sessions[0]?.endedAt).toBe('2026-11-06T08:00:00.000Z');
    expect(session.summary()).toEqual({ seen: 1, known: 0, toReview: [session.items[0]?.card] });
  });

  it('stores nothing when left before any answer', async () => {
    const store = new FakeStore();
    const session = start(store, [card('a')]);

    await session.quit();

    expect(store.sessions).toEqual([]);
  });
});
