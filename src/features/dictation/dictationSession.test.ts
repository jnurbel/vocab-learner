import { describe, expect, it } from 'vitest';
import { card, FakeStore, reviewed, srs } from './dictation.fixtures';
import { startDictationSession } from './dictationSession';

const morning = new Date('2026-11-06T08:00:00Z');
const cat = card('cat', { term: '猫' });
const dog = card('dog', { term: '狗' });

async function setup(store = new FakeStore()) {
  let ids = 0;
  const session = await startDictationSession(
    { language: 'zh', labelIds: ['lesson7'], words: [cat, dog] },
    {
      store,
      srs,
      clock: () => morning,
      newId: () => `session-${String((ids += 1))}`,
    },
  );
  return { store, session };
}

describe('a dictation session', () => {
  it('stores nothing until the first answer', async () => {
    const { store } = await setup();

    expect(store.sessions).toEqual([]);
  });

  it('stores each answer as a typed dictation answer, in a dictation session', async () => {
    const { store, session } = await setup();

    await session.record(cat, 'correct', { answer: '猫' });

    expect(store.sessions).toEqual([
      expect.objectContaining({
        id: 'session-1',
        language: 'zh',
        labelIds: ['lesson7'],
        mode: 'dictation',
        startedAt: morning.toISOString(),
      }),
    ]);
    expect(store.answers).toHaveLength(1);
    expect(store.answers[0]).toMatchObject({
      sessionId: 'session-1',
      activeDay: '2026-11-06',
      result: {
        cardId: 'cat',
        outcome: 'correct',
        exercise: 'listenType',
        rating: 'good',
        hintsUsed: 0,
        answer: '猫',
        at: morning.toISOString(),
      },
      state: { cardId: 'cat', reps: 1, lastRatedDay: '2026-11-06' },
    });
  });

  it('rates a typed answer without timing it: a hint or a typo gives hard, a wrong one again', async () => {
    const { store, session } = await setup();

    await session.record(cat, 'correctWithHint', { hintsUsed: 1 });
    await session.record(dog, 'wrong');

    expect(store.answers.map(({ result }) => result.rating)).toEqual(['hard', 'again']);
  });

  it('rates a word at most once a day, but still stores the answer', async () => {
    const store = new FakeStore({
      reviewStates: [reviewed('cat', { lastRatedDay: '2026-11-06', reps: 4 })],
    });
    const { session } = await setup(store);

    const applied = await session.record(cat, 'wrong');
    const again = await session.record(dog, 'correct');
    const twice = await session.record(dog, 'wrong');

    expect(applied.rated).toBe(false);
    expect(store.answers[0]?.state).toMatchObject({ reps: 4, lastRatedDay: '2026-11-06' });
    expect(again.rated).toBe(true);
    expect(twice.rated).toBe(false);
    expect(store.answers).toHaveLength(3);
  });

  it('keeps only a bounded and visible copy of the typed answer', async () => {
    const { store, session } = await setup();

    await session.record(cat, 'wrong', { answer: `猫\u0000${'x'.repeat(1_000)}` });

    const answer = store.answers[0]?.result.answer ?? '';
    expect(answer.startsWith('猫x')).toBe(true);
    expect(Array.from(answer)).toHaveLength(200);
  });

  it('ends the session only when something was stored', async () => {
    const empty = await setup();
    await empty.session.end();
    expect(empty.store.sessions).toEqual([]);

    const { store, session } = await setup();
    await session.record(cat, 'correct');
    await session.end();
    expect(store.sessions[0]?.endedAt).toBe(morning.toISOString());
  });
});
