import { describe, expect, it } from 'vitest';
import type { Card } from '../../domain/card';
import { card, FakeStore } from '../flashcards/flashcards.fixtures';
import { startPracticeSession } from './practiceSession';

const morning = new Date('2026-11-06T08:00:00Z');

function start(store: FakeStore, cards: Card[]) {
  return startPracticeSession(
    { cards, language: 'zh', labelIds: [] },
    { store, clock: () => morning, newId: () => 'practice-1', dayOf: () => '2026-11-06' },
  );
}

const twelveWords = Array.from({ length: 12 }, (_, index) => card(`w${String(index)}`));

describe('the game rewards of a free practice', () => {
  it('earns the points of each answer, written with it', async () => {
    const store = new FakeStore();
    const session = start(store, [card('a'), card('b')]);

    await session.answer('good');
    await session.answer('again');

    expect(store.progress).toMatchObject({ xp: 12, dailyXp: 12, dailyXpDay: '2026-11-06' });
    expect(session.rewards()?.breakdown).toEqual({ correct: 10, wrong: 2 });
  });

  it('never counts for the streak, even after many answers and to the end', async () => {
    const store = new FakeStore();
    const session = start(store, twelveWords);

    for (const _ of twelveWords) {
      await session.answer('good');
    }

    expect(session.finished).toBe(true);
    expect(session.rewards()).toMatchObject({ streakDays: 0, xpGained: 120 });
    expect(store.progress?.streakDays ?? 0).toBe(0);
  });

  it('earns the points of a typed answer', async () => {
    const store = new FakeStore();
    const session = start(store, [card('a'), card('b')]);

    await session.answerTyped('typeMeaning', 'almost', { answer: 'chatt' });

    expect(session.rewards()?.breakdown).toEqual({ almost: 5 });
  });
});
