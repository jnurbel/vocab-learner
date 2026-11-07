import { describe, expect, it } from 'vitest';
import type { Card } from '../../domain/card';
import type { ProgressRecord } from '../../domain/progressRecords';
import { card, FakeStore, reviewed, srs } from './flashcards.fixtures';
import { startFlashcardSession, type FlashcardStore } from './flashcardSession';

const morning = new Date('2026-11-06T08:00:00Z');

/** A word whose plant already reached its highest record: growing again earns nothing. */
const settled = (id: string) => reviewed(id, { peakStage: 'lantern' });

function start(store: FlashcardStore, cards: Card[]) {
  return startFlashcardSession(
    { cards, language: 'zh', labelIds: [] },
    { store, srs, clock: () => morning, newId: () => 'session-1' },
  );
}

describe('the game rewards of a flashcard session', () => {
  it('writes the points of each answer together with it', async () => {
    const store = new FakeStore({ reviewStates: [settled('a'), settled('b')] });
    const session = await start(store, [card('a'), card('b')]);

    await session.answer('good');

    expect(store.progress).toMatchObject({ xp: 10, dailyXp: 10, dailyXpDay: '2026-11-06' });
  });

  it('rewards a word discovered and its first sprout as a discovery', async () => {
    const store = new FakeStore();
    const session = await start(store, [card('new')]);

    await session.answer('good');

    expect(session.rewards()?.breakdown).toMatchObject({ cardIntroduced: 5, correct: 10 });
  });

  it('rewards a plant beating its record from the stem stage on', async () => {
    const sprout = reviewed('due', { stability: 3, successDays: 1, peakStage: 'sprout' });
    const store = new FakeStore({ reviewStates: [sprout] });
    const session = await start(store, [card('due')]);

    await session.answer('good');

    expect(session.rewards()?.breakdown).toMatchObject({ stageReached: 15 });
  });

  it('adds the points of a finished session, which makes the day active', async () => {
    const store = new FakeStore({ reviewStates: [settled('due')] });
    const session = await start(store, [card('due')]);

    await session.answer('good');

    expect(session.rewards()).toMatchObject({
      xpGained: 40,
      breakdown: { correct: 10, sessionCompleted: 30 },
      streakDays: 1,
    });
    expect(store.progress).toMatchObject({ xp: 40, streakDays: 1 });
  });

  it('gives no session points when the learner leaves before the end', async () => {
    const store = new FakeStore({ reviewStates: [settled('a'), settled('b')] });
    const session = await start(store, [card('a'), card('b')]);

    await session.answer('good');
    await session.quit();

    expect(session.rewards()?.breakdown).toEqual({ correct: 10 });
  });

  it('builds on the progress already stored', async () => {
    const stored: ProgressRecord = { xp: 95, dailyXp: 95, dailyXpDay: '2026-11-06' };
    const store = new FakeStore({ reviewStates: [reviewed('a'), reviewed('b')] }, stored);
    const session = await start(store, [card('a'), card('b')]);

    await session.answer('good');

    expect(session.rewards()).toMatchObject({ level: 2, levelUps: [2], unlocks: ['pier'] });
  });

  it('shows no points for an answer whose save failed', async () => {
    const store = new FakeStore({ reviewStates: [reviewed('due')] });
    store.failNextAnswer = true;
    const session = await start(store, [card('due')]);

    await expect(session.answer('good')).rejects.toThrow();

    expect(session.rewards()).toBeUndefined();
  });
});
