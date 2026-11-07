import { describe, expect, it } from 'vitest';
import type { Card } from '../../domain/card';
import { card, FakeStore, reviewed, srs } from '../flashcards/flashcards.fixtures';
import { startListenMeaningSession } from './listenMeaningSession';

const morning = new Date('2026-11-06T08:00:00Z');
const meanings = ['chat', 'chien', 'oiseau', 'poisson', 'cheval'];
const words = meanings.map((meaning, index) =>
  card(`w${String(index)}`, undefined, { term: `词${String(index)}`, translation: meaning }),
);
/** Words already rated today: answering them again leaves their memory untouched. */
const ratedToday = words.map(({ id }) => reviewed(id, { lastRatedDay: '2026-11-06' }));

function start(store: FakeStore, cards: Card[] = words) {
  let clock = morning.getTime();
  return startListenMeaningSession(
    { cards, language: 'zh', labelIds: [] },
    {
      store,
      srs,
      clock: () => new Date((clock += 1000)),
      newId: () => 'game-1',
    },
  );
}

describe('a ListenMeaning session', () => {
  it('asks each word of the round once, with options that hold its meaning', async () => {
    const store = new FakeStore({ reviewStates: words.map(({ id }) => reviewed(id)) });
    const session = await start(store);

    const asked: string[] = [];
    while (session.current !== undefined) {
      const question = session.current;
      expect(question.options).toContain(question.target);
      asked.push(question.target.id);
      await session.answer(question.target, { hintsUsed: 0 });
    }

    expect(asked.sort()).toEqual(words.map(({ id }) => id).sort());
    expect(session.summary()).toEqual({ answered: 5, correct: 5 });
  });

  it('stores a right answer as a listenMeaning result, rated by its response time', async () => {
    const store = new FakeStore({ reviewStates: words.map(({ id }) => reviewed(id)) });
    const session = await start(store);
    const target = session.current!.target;

    const result = await session.answer(target, { hintsUsed: 0 });

    expect(result).toMatchObject({ outcome: 'correct', rating: 'good', rated: true });
    expect(store.sessions[0]).toMatchObject({ id: 'game-1', mode: 'listenMeaning' });
    expect(store.answers[0]?.result).toMatchObject({
      cardId: target.id,
      exercise: 'listenMeaning',
      outcome: 'correct',
      rating: 'good',
      hintsUsed: 0,
      responseMs: 1000,
    });
    expect(store.answers[0]?.state.lastRatedDay).toBe('2026-11-06');
  });

  it('rates a wrong choice again, and "Je ne sais pas" too', async () => {
    const store = new FakeStore({ reviewStates: words.map(({ id }) => reviewed(id)) });
    const session = await start(store);
    const first = session.current!;
    const wrong = first.options.find((option) => option !== first.target)!;

    expect(await session.answer(wrong, { hintsUsed: 0 })).toMatchObject({ outcome: 'wrong' });
    expect(await session.answer('unknown', { hintsUsed: 0 })).toMatchObject({
      outcome: 'wrong',
      rating: 'again',
    });
    expect(store.answers[0]?.result.answer).toBe(wrong.translation);
  });

  it('stores the state of a word already rated today, without a second rating, and its points', async () => {
    const store = new FakeStore({ reviewStates: ratedToday });
    const session = await start(store);
    const target = session.current!.target;

    const result = await session.answer(target, { hintsUsed: 0 });

    expect(result.rated).toBe(false);
    const before = ratedToday.find(({ cardId }) => cardId === target.id)!;
    const { stability, difficulty, reps, due, lastRatedDay } = before;
    // The memory is untouched; a right answer still counts a day of success.
    expect(store.answers[0]?.state).toMatchObject({
      stability,
      difficulty,
      reps,
      due,
      lastRatedDay,
    });
    expect(store.answers[0]?.state.successDays).toBe(before.successDays + 1);
    expect(session.rewards()?.breakdown).toMatchObject({ correct: 10 });
  });

  it('moves the adaptive level of the game with the answers', async () => {
    const store = new FakeStore({ reviewStates: words.map(({ id }) => reviewed(id)) });
    const session = await start(store);

    await session.answer(session.current!.target, { hintsUsed: 0 });

    expect(store.progress?.gameLevels).toEqual({
      'listenMeaning:zh': { level: 2, window: [true] },
    });
  });

  it('earns the points of a finished round', async () => {
    const store = new FakeStore({ reviewStates: words.map(({ id }) => reviewed(id)) });
    const session = await start(store);
    while (session.current !== undefined) {
      await session.answer(session.current.target, { hintsUsed: 0 });
    }

    expect(session.rewards()?.breakdown).toMatchObject({ sessionCompleted: 30 });
  });

  it('has no question when the language holds a single word', async () => {
    const session = await start(new FakeStore(), [words[0]!]);

    expect(session.current).toBeUndefined();
    expect(session.eligible).toBe(false);
  });

  it('refuses an answer once the round is over', async () => {
    const session = await start(new FakeStore(), [words[0]!]);

    await expect(session.answer('unknown', { hintsUsed: 0 })).rejects.toThrow('The round is over');
  });
});
