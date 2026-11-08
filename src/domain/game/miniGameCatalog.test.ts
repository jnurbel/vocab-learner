import { describe, expect, it } from 'vitest';
import type { Card } from '../card';
import { MINI_GAME_CONFIG } from './miniGameConfig';
import { MINI_GAMES, miniGameCatalog } from './miniGameCatalog';

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

const byGame = (cards: Card[], language: 'zh' | 'en' = 'zh') =>
  Object.fromEntries(miniGameCatalog(cards, language, MINI_GAME_CONFIG).map((g) => [g.game, g]));

describe('miniGameCatalog', () => {
  it('lists ListenMeaning and the four games of the recognise and sentence steps, in order', () => {
    expect(MINI_GAMES).toEqual([
      'listenMeaning',
      'bridgeMatch',
      'toneEcho',
      'sentenceListen',
      'sentenceShuffle',
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
    });
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
