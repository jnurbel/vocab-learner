import { describe, expect, it } from 'vitest';
import type { Card } from '../../domain/card';
import { card, FakeStore, reviewed, srs } from '../flashcards/flashcards.fixtures';
import { startMeasureWordSession } from './measureWordSession';
import { sentenceResources } from './sentence.fixtures';

const morning = new Date('2026-11-06T08:00:00Z');
const nouns: Card[] = [
  card('book', undefined, { term: '书', pinyin: 'shū', translation: 'livre' }),
  card('cat', undefined, { term: '猫', pinyin: 'māo', translation: 'chat' }),
  card('dog', undefined, { term: '狗', pinyin: 'gǒu', translation: 'chien' }),
  card('friend', undefined, { term: '朋友', pinyin: 'péngyou', translation: 'ami' }),
  card('run', undefined, { term: '跑步', pinyin: 'pǎobù', translation: 'courir' }),
];

function start(
  store: FakeStore,
  {
    cards = nouns,
    cardIds,
    offline = false,
  }: { cards?: Card[]; cardIds?: string[]; offline?: boolean } = {},
) {
  return startMeasureWordSession(
    { cards, language: 'zh', labelIds: [], ...(cardIds === undefined ? {} : { cardIds }) },
    {
      store,
      srs,
      clock: () => morning,
      newId: () => 'mw-1',
      loadSentences: () =>
        offline ? Promise.reject(new Error('offline')) : Promise.resolve(sentenceResources()),
    },
  );
}

const reviewedStore = () => new FakeStore({ reviewStates: nouns.map(({ id }) => reviewed(id)) });

describe('a MeasureWord session', () => {
  it('asks each noun of the table once, and stores answers that FSRS never rates', async () => {
    const store = reviewedStore();
    const session = await start(store);
    const asked: string[] = [];

    while (session.current !== undefined) {
      asked.push(session.current.target.id);
      await session.answer(session.current.right[0] ?? 'unknown');
    }

    expect(asked.sort()).toEqual(['book', 'cat', 'dog', 'friend']);
    expect(store.answers[0]?.result).toMatchObject({ exercise: 'measureWord', outcome: 'correct' });
    expect(store.answers[0]?.state).toBeUndefined();
    expect(store.answers[0]?.result.rating).toBeUndefined();
    expect(session.summary()).toEqual({ answered: 4, correct: 4 });
    expect(store.sessions[0]?.endedAt).toBeDefined();
  });

  it('keeps the chosen measure word, and none for "Je ne sais pas"', async () => {
    const store = reviewedStore();
    const session = await start(store);

    expect(await session.answer('张')).toBe('wrong');
    expect(await session.answer('unknown')).toBe('wrong');
    expect(store.answers.map(({ result }) => result.answer)).toEqual(['张', undefined]);
    expect(session.position).toBe(2);
    expect(session.total).toBe(4);
  });

  it('is not eligible with fewer than 4 nouns, nor without the table', async () => {
    expect((await start(reviewedStore(), { cards: nouns.slice(0, 3) })).eligible).toBe(false);
    expect((await start(reviewedStore(), { offline: true })).eligible).toBe(false);
  });

  it('asks the imposed nouns of a step session, however few', async () => {
    const session = await start(reviewedStore(), { cardIds: ['cat', 'run'] });

    expect(session.total).toBe(1);
    expect(session.current?.target.id).toBe('cat');
  });

  it('refuses an answer once the round is over, and leaves early with what was stored', async () => {
    const store = reviewedStore();
    const session = await start(store);
    await session.answer('unknown');

    await session.quit();

    await expect(session.answer('本')).rejects.toThrow('The round is over');
    expect(session.rewards()?.xpGained).toBe(2);
    expect(store.sessions[0]?.endedAt).toBeDefined();
  });
});
