import { describe, expect, it } from 'vitest';
import { card, FakeStore } from './dictation.fixtures';
import { srs } from './dictation.fixtures';
import { startDictationSession } from './dictationSession';

const morning = new Date('2026-11-06T08:00:00Z');
const cat = card('cat', { term: '猫' });
const dog = card('dog', { term: '狗' });

async function setup(store = new FakeStore()) {
  const session = await startDictationSession(
    { language: 'zh', labelIds: [], words: [cat, dog] },
    { store, srs, clock: () => morning, newId: () => 'dictation-1' },
  );
  return { store, session };
}

describe('the game rewards of a dictation', () => {
  it('earns the points of each word, written with it, a new word counting as discovered', async () => {
    const { store, session } = await setup();

    await session.record(cat, 'correct');
    await session.record(dog, 'wrong');

    expect(session.rewards()?.breakdown).toEqual({ cardIntroduced: 10, correct: 10, wrong: 2 });
    expect(store.progress).toMatchObject({ xp: 22, dailyXpDay: '2026-11-06' });
  });

  it('earns the points of a finished session at the end, which makes the day active', async () => {
    const { store, session } = await setup();
    await session.record(cat, 'correct');

    await session.end();

    expect(session.rewards()).toMatchObject({
      breakdown: { sessionCompleted: 30 },
      streakDays: 1,
    });
    expect(store.progress).toMatchObject({ streakDays: 1 });
  });

  it('earns nothing for a dictation ended before any word', async () => {
    const { store, session } = await setup();

    await session.end();

    expect(session.rewards()).toBeUndefined();
    expect(store.progress).toBeUndefined();
  });
});
