import { describe, expect, it, vi } from 'vitest';
import type { Card } from '../../domain/card';
import type { PinyinGenerator } from '../../domain/pinyinGeneration';
import { card, FakeStore, reviewed, srs } from '../flashcards/flashcards.fixtures';
import { startGapFillSession, type GapFillDependencies } from './gapFillSession';
import { bankSentence, sentenceResources } from './sentence.fixtures';

const morning = new Date('2026-11-06T08:00:00Z');
const friend = card('friend', undefined, { term: '朋友', pinyin: 'péngyou', translation: 'ami' });
const time = card('time', undefined, {
  term: '时间',
  pinyin: 'shíjiān',
  translation: 'temps',
  example: '我没有时间。',
});
const others = [
  card('cat', undefined, { term: '猫', pinyin: 'māo', translation: 'chat' }),
  card('dog', undefined, { term: '狗', pinyin: 'gǒu', translation: 'chien' }),
  card('bird', undefined, { term: '鸟', pinyin: 'niǎo', translation: 'oiseau' }),
];
const words: Card[] = [friend, time, ...others];
const resources = sentenceResources([bankSentence(5, '我 的 朋友 来 了 。', 'Mon ami est venu.')]);
/** Every word has its own sound here: a wrong word is never "same sound". */
const noPinyin: () => Promise<PinyinGenerator> = () => Promise.resolve((hanzi) => hanzi);

function start(
  store: FakeStore,
  { cards = words, cardIds, level }: { cards?: Card[]; cardIds?: string[]; level?: 1 | 2 | 3 } = {},
  loadSentences: GapFillDependencies['loadSentences'] | 'none' = () => Promise.resolve(resources),
) {
  if (level !== undefined) {
    store.progress = { gameLevels: { 'gapFill:zh': { level, window: [] } } };
  }
  let clock = morning.getTime();
  return startGapFillSession(
    { cards, language: 'zh', labelIds: [], ...(cardIds === undefined ? {} : { cardIds }) },
    {
      store,
      srs,
      clock: () => new Date((clock += 1000)),
      newId: () => 'gap-1',
      ...(loadSentences === 'none' ? {} : { loadSentences }),
      loadPinyin: noPinyin,
    },
  );
}

const reviewedStore = () => new FakeStore({ reviewStates: words.map(({ id }) => reviewed(id)) });

describe('a GapFill session', () => {
  it('asks the words with an example or a bank sentence, and stores rated gapFill answers', async () => {
    const store = reviewedStore();
    const session = await start(store);
    const asked: string[] = [];

    while (session.current !== undefined) {
      asked.push(session.current.target.id);
      await session.answerChoice(session.current.target, 0);
    }

    expect(asked.sort()).toEqual(['friend', 'time']);
    expect(store.answers[0]?.result).toMatchObject({ exercise: 'gapFill', outcome: 'correct' });
    expect(store.answers[0]?.state?.lastRatedDay).toBe('2026-11-06');
    expect(session.summary()).toEqual({ answered: 2, correct: 2 });
    expect(store.sessions[0]?.endedAt).toBeDefined();
  });

  it('gives a bank sentence its translation and its source', async () => {
    const session = await start(reviewedStore(), { cardIds: ['friend'] });

    expect(session.current?.sentence).toMatchObject({
      text: '我的朋友来了。',
      translation: { lang: 'fr', text: 'Mon ami est venu.' },
      bank: { id: 5, author: 'sysko' },
    });
  });

  it('still asks the examples when the sentence data cannot be loaded', async () => {
    const session = await start(reviewedStore(), {}, () => Promise.reject(new Error('offline')));

    expect(session.total).toBe(1);
    expect(session.current?.target.id).toBe('time');
  });

  it('asks only the examples without sentence data at all', async () => {
    const session = await start(reviewedStore(), {}, 'none');

    expect(session.total).toBe(1);
  });

  it('is not eligible without any sentence', async () => {
    const session = await start(reviewedStore(), { cards: others });

    expect(session.eligible).toBe(false);
  });

  it('compares a typed word as in the dictation, and turns a hint into correctWithHint', async () => {
    const store = reviewedStore();
    const session = await start(store, { cardIds: ['friend', 'time'], level: 3 });
    const first = session.current?.target;

    const right = await session.answerTyped(first?.term ?? '', 1);
    const wrong = await session.answerTyped('猫', 0);

    expect(right).toMatchObject({ outcome: 'correctWithHint', rating: 'hard' });
    expect(right.comparison?.outcome).toBe('correct');
    expect(wrong).toMatchObject({ outcome: 'wrong', rating: 'again' });
    expect(store.answers.map(({ result }) => result.answer)).toEqual([first?.term, '猫']);
  });

  it('stores no answer text for "Je ne sais pas"', async () => {
    const store = reviewedStore();
    const session = await start(store, { cardIds: ['friend'] });

    await session.answerChoice('unknown', 0);

    expect(store.answers[0]?.result.outcome).toBe('wrong');
    expect(store.answers[0]?.result.answer).toBeUndefined();
  });

  it('refuses an answer once the round is over, and leaves early with what was stored', async () => {
    const store = reviewedStore();
    const session = await start(store, { cardIds: ['friend', 'time'] });
    await session.answerChoice('unknown', 0);

    await session.quit();

    await expect(session.answerChoice('unknown', 0)).rejects.toThrow('The round is over');
    expect(session.summary().answered).toBe(1);
    expect(session.rewards()?.xpGained).toBe(2);
    expect(store.sessions[0]?.endedAt).toBeDefined();
  });

  it('reads the sentence data only for Chinese', async () => {
    const loadSentences = vi.fn(() => Promise.resolve(resources));
    await startGapFillSession(
      {
        cards: [card('cat-en', undefined, { language: 'en', term: 'cat' })],
        language: 'en',
        labelIds: [],
      },
      {
        store: new FakeStore(),
        srs,
        clock: () => morning,
        newId: () => 'gap-en',
        loadSentences,
        loadPinyin: noPinyin,
      },
    );

    expect(loadSentences).not.toHaveBeenCalled();
  });
});
