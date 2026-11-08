import { describe, expect, it } from 'vitest';
import type { Card } from '../../domain/card';
import { card, FakeStore, reviewed, srs } from '../flashcards/flashcards.fixtures';
import { startSentenceListenSession } from './sentenceListenSession';

const morning = new Date('2026-11-06T08:00:00Z');
const words: Card[] = [
  card('time', undefined, {
    term: '时间',
    pinyin: 'shíjiān',
    translation: 'temps',
    example: '我没有时间。',
  }),
  card('cat', undefined, { term: '猫', pinyin: 'māo', translation: 'chat', example: '猫在睡觉。' }),
  card('dog', undefined, { term: '狗', pinyin: 'gǒu', translation: 'chien' }),
  card('bird', undefined, { term: '鸟', pinyin: 'niǎo', translation: 'oiseau' }),
];

function start(store: FakeStore, cardIds?: string[], cards = words) {
  let clock = morning.getTime();
  return startSentenceListenSession(
    { cards, language: 'zh', labelIds: [], ...(cardIds === undefined ? {} : { cardIds }) },
    { store, srs, clock: () => new Date((clock += 1000)), newId: () => 'sl-1' },
  );
}

const reviewedStore = () => new FakeStore({ reviewStates: words.map(({ id }) => reviewed(id)) });

describe('a SentenceListen session', () => {
  it('asks each word that has an example once, and stores rated sentenceListen answers', async () => {
    const store = reviewedStore();
    const session = await start(store);
    const asked: string[] = [];

    while (session.current !== undefined) {
      asked.push(session.current.target.id);
      await session.answer(session.current.target, { hintsUsed: 0 });
    }

    expect(asked.sort()).toEqual(['cat', 'time']);
    expect(store.answers[0]?.result).toMatchObject({
      exercise: 'sentenceListen',
      outcome: 'correct',
      rating: 'good',
    });
    expect(store.answers[0]?.state?.lastRatedDay).toBe('2026-11-06');
    expect(session.summary()).toEqual({ answered: 2, correct: 2 });
    expect(store.sessions[0]?.endedAt).toBeDefined();
  });

  it('times the answer from the end of the reading, not from the start of the sentence', async () => {
    const store = reviewedStore();
    let now = morning.getTime();
    const session = await startSentenceListenSession(
      { cards: words, language: 'zh', labelIds: [] },
      { store, srs, clock: () => new Date(now), newId: () => 'sl-2' },
    );
    now += 12_000;
    session.heard();
    now += 2_000;

    await session.answer(session.current?.target ?? 'unknown', { hintsUsed: 0 });

    expect(store.answers[0]?.result).toMatchObject({ responseMs: 2000, rating: 'good' });
  });

  it('asks only the imposed words', async () => {
    const session = await start(reviewedStore(), ['cat']);

    expect(session.current?.target.id).toBe('cat');
    expect(session.total).toBe(1);
  });

  it('is not eligible without an example sentence', async () => {
    const session = await start(reviewedStore(), undefined, words.slice(2));

    expect(session.eligible).toBe(false);
  });

  it('refuses an answer once the round is over, and leaves early with what was stored', async () => {
    const store = reviewedStore();
    const session = await start(store);
    await session.answer('unknown', { hintsUsed: 0 });

    await session.quit();

    expect(store.answers[0]?.result.outcome).toBe('wrong');
    expect(store.sessions[0]?.endedAt).toBeDefined();
    await expect(session.answer('unknown', { hintsUsed: 0 })).rejects.toThrow('The round is over');
  });
});
