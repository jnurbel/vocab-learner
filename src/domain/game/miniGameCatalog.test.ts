import { describe, expect, it } from 'vitest';
import type { Card } from '../card';
import type { BankSentence } from '../sentence/sentenceData';
import { MINI_GAME_CONFIG } from './miniGameConfig';
import { MINI_GAMES, miniGameCatalog, type CatalogSentences } from './miniGameCatalog';

function word(id: string, overrides: Partial<Card> = {}): Card {
  return {
    id,
    language: 'zh',
    term: id,
    translation: `meaning ${id}`,
    labelIds: [],
    source: 'manual',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

const byGame = (cards: Card[], language: 'zh' | 'en' = 'zh', sentences?: CatalogSentences) =>
  Object.fromEntries(
    miniGameCatalog(cards, language, MINI_GAME_CONFIG, sentences).map((g) => [g.game, g]),
  );

const bankSentence: BankSentence = {
  id: 1,
  author: 'sysko',
  words: ['朋友', '来', '了', '。'],
  text: '朋友来了。',
  translation: { lang: 'fr', id: 2, author: 'Scott', text: 'L’ami est venu.' },
  t2s: false,
  cc0: false,
};

const loaded: CatalogSentences = {
  bank: (card) => (card.term === '朋友' ? [bankSentence] : []),
  measureWords: new Map([
    ['朋友', ['个']],
    ['书', ['本']],
    ['猫', ['只']],
    ['狗', ['只']],
  ]),
};

describe('miniGameCatalog', () => {
  it('lists ListenMeaning, the games of the recognise and sentence steps, then the Chinese ones', () => {
    expect(MINI_GAMES).toEqual([
      'listenMeaning',
      'bridgeMatch',
      'toneEcho',
      'sentenceListen',
      'sentenceShuffle',
      'gapFill',
      'measureWord',
      'sentenceWorkshop',
    ]);
  });

  it('counts the eligible words of each game in the language, and tells why one is closed', () => {
    const cards = [
      word('时间', { pinyin: 'shíjiān', example: '我没有时间吃饭。' }),
      word('猫', { pinyin: 'māo' }),
      word('cat', { language: 'en' }),
    ];

    expect(byGame(cards)).toEqual({
      listenMeaning: { game: 'listenMeaning', eligibleWords: 2, open: true },
      bridgeMatch: { game: 'bridgeMatch', eligibleWords: 2, open: false, reason: 'fewWords' },
      toneEcho: { game: 'toneEcho', eligibleWords: 2, open: true },
      sentenceListen: { game: 'sentenceListen', eligibleWords: 1, open: true },
      sentenceShuffle: { game: 'sentenceShuffle', eligibleWords: 1, open: true },
      gapFill: { game: 'gapFill', eligibleWords: 1, open: true },
      measureWord: { game: 'measureWord', eligibleWords: 0, open: false, reason: 'noSentenceData' },
      sentenceWorkshop: { game: 'sentenceWorkshop', eligibleWords: 2, open: true },
    });
  });

  it('counts the words of GapFill with an example or a bank sentence', () => {
    const cards = [word('朋友'), word('时间', { example: '我没有时间。' }), word('政府')];

    expect(byGame(cards, 'zh', loaded)['gapFill']).toEqual({
      game: 'gapFill',
      eligibleWords: 2,
      open: true,
    });
    expect(byGame([word('政府')], 'zh', loaded)['gapFill']).toMatchObject({
      open: false,
      reason: 'noExamples',
    });
  });

  it('opens MeasureWord from 4 nouns of the table of measure words', () => {
    const nouns = ['朋友', '书', '猫'].map((term) => word(term));

    expect(byGame(nouns, 'zh', loaded)['measureWord']).toEqual({
      game: 'measureWord',
      eligibleWords: 3,
      open: false,
      reason: 'fewNouns',
    });
    expect(byGame([...nouns, word('狗')], 'zh', loaded)['measureWord']).toMatchObject({
      open: true,
      eligibleWords: 4,
    });
  });

  it('opens the workshop on any Chinese word', () => {
    expect(byGame([], 'zh', loaded)['sentenceWorkshop']).toMatchObject({
      open: false,
      reason: 'fewWords',
    });
  });

  it('offers neither MeasureWord nor the workshop in English: they are Chinese games', () => {
    const games = byGame([word('cat', { language: 'en', example: 'My cat.' })], 'en', loaded);

    expect(Object.keys(games)).not.toContain('measureWord');
    expect(Object.keys(games)).not.toContain('sentenceWorkshop');
    expect(games['gapFill']).toMatchObject({ eligibleWords: 1 });
  });

  it('closes the games that need what the words lack: pinyin, examples, more words', () => {
    const games = byGame([word('猫'), word('狗'), word('鸟')]);

    expect(games['bridgeMatch']).toMatchObject({ open: true, eligibleWords: 3 });
    expect(games['toneEcho']).toMatchObject({ open: false, reason: 'noPinyin' });
    expect(games['sentenceListen']).toMatchObject({ open: false, reason: 'noExamples' });
    expect(games['sentenceShuffle']).toMatchObject({ open: false, reason: 'noExamples' });
    expect(byGame([word('猫')])['listenMeaning']).toMatchObject({
      open: false,
      reason: 'fewWords',
    });
  });

  it('keeps the English pairs open, as they come from our own list', () => {
    expect(byGame([], 'en')['toneEcho']).toEqual({
      game: 'toneEcho',
      eligibleWords: 0,
      open: true,
    });
  });

  it('needs a second word to offer beside a sentence', () => {
    const alone = [word('时间', { example: '我没有时间吃饭。' })];

    expect(byGame(alone)['sentenceListen']).toMatchObject({ open: false, reason: 'fewWords' });
  });
});
