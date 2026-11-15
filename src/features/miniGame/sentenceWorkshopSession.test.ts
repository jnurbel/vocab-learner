import { describe, expect, it, vi } from 'vitest';
import type { Card } from '../../domain/card';
import { card, FakeStore, reviewed, srs } from '../flashcards/flashcards.fixtures';
import { bankSentence, sentenceResources } from './sentence.fixtures';
import { startSentenceWorkshopSession } from './sentenceWorkshopSession';

const morning = new Date('2026-11-06T08:00:00Z');
const friend = card('friend', undefined, { term: '朋友', pinyin: 'péngyou', translation: 'ami' });
const book = card('book', undefined, {
  term: '书',
  pinyin: 'shū',
  translation: 'livre',
  example: '我有一本书。',
});
const cat = card('cat', undefined, { term: '猫', pinyin: 'māo', translation: 'chat' });
const english = card('apple', undefined, { language: 'en', term: 'apple', translation: 'pomme' });
const words: Card[] = [friend, book, cat, english];
const resources = sentenceResources([bankSentence(5, '我 的 朋友 来 了 。', 'Mon ami est venu.')]);

/** Stem stage: stable for 3 days, right on 2 days. */
const grown = (cardId: string) => reviewed(cardId, { stability: 5, successDays: 2 });

function start(
  store = new FakeStore(),
  { offline = false, cardIds }: { offline?: boolean; cardIds?: string[] } = {},
) {
  const keepExample = vi.fn(() => Promise.resolve());
  const session = startSentenceWorkshopSession(
    { cards: words, language: 'zh', labelIds: [], ...(cardIds === undefined ? {} : { cardIds }) },
    {
      store,
      srs,
      clock: () => morning,
      newId: () => 'ws-1',
      loadSentences: () =>
        offline ? Promise.reject(new Error('offline')) : Promise.resolve(resources),
      keepExample,
    },
  );
  return { session, keepExample, store };
}

describe('a round of the sentence workshop', () => {
  it('offers Chinese words, those at the stem stage first', async () => {
    const store = new FakeStore({ reviewStates: [grown('cat')] });
    const session = await start(store).session;

    expect(session.eligible).toBe(true);
    expect(session.total).toBe(1);
    expect(session.current?.id).toBe('cat');
  });

  it('offers any Chinese word when none has grown yet, up to 3', async () => {
    const session = await start().session;

    expect(session.total).toBe(3);
    expect(session.words.map(({ id }) => id).sort()).toEqual(['book', 'cat', 'friend']);
  });

  it('lets the learner choose another word of their list', async () => {
    const session = await start().session;

    expect(session.chooseWord('friend')?.id).toBe('friend');
    expect(session.chooseWord('apple')?.id).toBe('friend');
  });

  it('checks a sentence as often as wanted, then rewards it once judged', async () => {
    const { session, store } = start(undefined, { cardIds: ['friend'] });
    const round = await session;

    expect(round.check('我的朋友是高。').errors.map(({ rule }) => rule)).toEqual([
      'shiBeforeAdjective',
    ]);
    expect(round.check('我的朋友很高。').errors).toEqual([]);
    await round.judge(true);

    expect(store.progress).toMatchObject({ xp: 15, sentenceBanners: 1 });
    expect(store.answers).toEqual([]);
    expect(round.sentences).toEqual([{ term: '朋友', sentence: '我的朋友很高。' }]);
    expect(round.current).toBeUndefined();
    expect(round.judgedCount).toBe(1);
    expect(round.rewards()?.xpGained).toBe(15);
  });

  it('hangs no banner for a sentence with an error found', async () => {
    const { session, store } = start(undefined, { cardIds: ['friend'] });
    const round = await session;

    round.check('我的朋友是高。');
    await round.judge(true);

    expect(store.progress).toMatchObject({ xp: 10 });
    expect(store.progress?.sentenceBanners).toBeUndefined();
  });

  it('shows the example of the word as a model, else a bank sentence', async () => {
    const round = await start(undefined, { cardIds: ['friend'] }).session;

    expect(round.model()?.bank?.id).toBe(5);
    expect(round.chooseWord('book')).toBe(book);
    expect(round.model()?.text).toBe('我有一本书。');
  });

  it('keeps a sentence without error found as the example of a word that has none', async () => {
    const { session, keepExample } = start(undefined, { cardIds: ['friend'] });
    const round = await session;

    round.check('我的朋友是高。');
    expect(round.canKeep).toBe(false);
    await expect(round.keepAsExample()).rejects.toThrow('cannot be kept');
    round.check('我的朋友很高。');
    await round.keepAsExample();

    expect(keepExample).toHaveBeenCalledWith(friend, '我的朋友很高。');
  });

  it('asks to check a sentence before judging it', async () => {
    const round = await start().session;

    await expect(round.judge(true)).rejects.toThrow('Check the sentence first');
    expect(round.canKeep).toBe(false);
  });

  it('is not eligible without the sentence data, which checks the sentences', async () => {
    const round = await start(undefined, { offline: true }).session;

    expect(round.eligible).toBe(false);
    expect(() => round.check('我的朋友很高。')).toThrow('No sentence data');
  });

  it('refuses a sentence once the round is over', async () => {
    const round = await start(undefined, { cardIds: ['friend'] }).session;
    round.check('我的朋友很高。');
    await round.judge(false);

    expect(() => round.check('好')).toThrow('The round is over');
    expect(round.position).toBe(1);
  });
});
