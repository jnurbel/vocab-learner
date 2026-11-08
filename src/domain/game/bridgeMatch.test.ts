import { describe, expect, it } from 'vitest';
import type { Card } from '../card';
import { GAME_CONFIG } from '../srs/config';
import {
  bridgeBoard,
  bridgePairResult,
  bridgeRound,
  bridgeVariant,
  type BridgeVariant,
} from './bridgeMatch';
import { MINI_GAME_CONFIG } from './miniGameConfig';

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

describe('bridgeVariant', () => {
  it('links words to meanings on 4 pairs at level 1, sound to meaning on 5 at level 2, sound to word on 6 at level 3', () => {
    expect(bridgeVariant(1, 'zh', { voice: true }, MINI_GAME_CONFIG)).toEqual({
      left: 'term',
      right: 'meaning',
      pairs: 4,
    });
    expect(bridgeVariant(2, 'zh', { voice: true }, MINI_GAME_CONFIG)).toEqual({
      left: 'audio',
      right: 'meaning',
      pairs: 5,
    });
    expect(bridgeVariant(3, 'en', { voice: true }, MINI_GAME_CONFIG)).toEqual({
      left: 'audio',
      right: 'term',
      pairs: 6,
    });
  });
});

describe('bridgeVariant without a voice', () => {
  it('shows the written word instead of the sound, and the pinyin at level 3 in Chinese', () => {
    const silent = { voice: false };

    expect(bridgeVariant(2, 'zh', silent, MINI_GAME_CONFIG)).toMatchObject({
      left: 'term',
      right: 'meaning',
    });
    expect(bridgeVariant(3, 'zh', silent, MINI_GAME_CONFIG)).toMatchObject({
      left: 'term',
      right: 'pinyin',
    });
    expect(bridgeVariant(3, 'en', silent, MINI_GAME_CONFIG)).toMatchObject({
      left: 'term',
      right: 'meaning',
    });
  });
});

const meanings: BridgeVariant = { left: 'term', right: 'meaning', pairs: 4 };
const ids = (cards: readonly Card[]) => cards.map(({ id }) => id).sort();

describe('bridgeBoard', () => {
  const others = ['o1', 'o2', 'o3', 'o4', 'o5'].map((id) => word(id));

  it('puts the imposed words on the board first, then fills it with other words', () => {
    const targets = [word('t1'), word('t2')];

    const board = bridgeBoard(
      targets,
      others,
      meanings,
      { seed: 's', close: false },
      MINI_GAME_CONFIG,
    );

    expect(board?.left).toHaveLength(4);
    expect(board?.left.map(({ id }) => id)).toEqual(expect.arrayContaining(['t1', 't2']));
    expect(ids(board?.right ?? [])).toEqual(ids(board?.left ?? []));
  });

  it('never puts two words of the same meaning, nor two homophones, on one board', () => {
    const time = word('shijian', { term: '时间', pinyin: 'shíjiān', translation: 'temps' });
    const weather = word('tianqi', { term: '天气', pinyin: 'tiānqì', translation: 'le temps' });
    const thing = word('shi', { term: '事', pinyin: 'shì', translation: 'affaire' });
    const be = word('shi2', { term: '是', pinyin: 'shì', translation: 'être' });

    const board = bridgeBoard(
      [time, weather, thing, be],
      others,
      { left: 'audio', right: 'meaning', pairs: 4 },
      { seed: 's', close: false },
      MINI_GAME_CONFIG,
    );

    const onBoard = ids(board?.left ?? []);
    expect(onBoard).toContain('shijian');
    expect(onBoard).not.toContain('tianqi');
    expect(onBoard.filter((id) => id === 'shi' || id === 'shi2')).toHaveLength(1);
    expect(onBoard).toHaveLength(4);
  });

  it('leaves the words without pinyin off a pinyin board', () => {
    const toned = ['a', 'b', 'c'].map((id, index) =>
      word(id, { pinyin: ['mā', 'bó', 'kě'][index] ?? '' }),
    );

    const board = bridgeBoard(
      [word('bare'), ...toned],
      [],
      { left: 'term', right: 'pinyin', pairs: 4 },
      { seed: 's', close: false },
      MINI_GAME_CONFIG,
    );

    expect(ids(board?.left ?? [])).toEqual(['a', 'b', 'c']);
  });

  it('makes no board with fewer words than the minimum of pairs', () => {
    expect(
      bridgeBoard(
        [word('a'), word('b')],
        [],
        meanings,
        { seed: 's', close: false },
        MINI_GAME_CONFIG,
      ),
    ).toBeUndefined();
  });

  it('fills a level 3 board with the words that sound closest to the first one', () => {
    const time = word('shijian', { term: '时间', pinyin: 'shíjiān', translation: 'temps' });
    const far = [
      word('mao', { term: '猫', pinyin: 'māo', translation: 'chat' }),
      word('gou', { term: '狗', pinyin: 'gǒu', translation: 'chien' }),
      word('niao', { term: '鸟', pinyin: 'niǎo', translation: 'oiseau' }),
    ];
    const close = [
      word('shijian2', { term: '事件', pinyin: 'shìjiàn', translation: 'événement' }),
      word('shiji', { term: '实际', pinyin: 'shíjì', translation: 'réel' }),
    ];

    const board = bridgeBoard(
      [time],
      [...far, ...close],
      { left: 'audio', right: 'term', pairs: 3 },
      { seed: 's', close: true },
      MINI_GAME_CONFIG,
    );

    expect(ids(board?.left ?? [])).toEqual(['shiji', 'shijian', 'shijian2']);
  });
});

describe('bridgeRound', () => {
  const zh = ['a', 'b', 'c', 'd'].map((id) => word(id));
  const en = word('e', { language: 'en' });

  it('asks the imposed words first, then lets the other words of the language fill the boards', () => {
    const round = bridgeRound([...zh, en], new Set(), 'zh', { seed: 's', cardIds: ['c', 'a'] });

    expect(ids(round.targets)).toEqual(['a', 'c']);
    expect(ids(round.others)).toEqual(['b', 'd']);
  });

  it('asks the words already introduced first when no word is imposed', () => {
    const round = bridgeRound([...zh, en], new Set(['b', 'd']), 'zh', { seed: 's' });

    expect(ids(round.targets.slice(0, 2))).toEqual(['b', 'd']);
    expect(ids(round.targets)).toEqual(['a', 'b', 'c', 'd']);
    expect(round.others).toEqual([]);
  });
});

describe('bridgePairResult', () => {
  it('is right and rated good when the pair was found at the first try, quickly', () => {
    expect(bridgePairResult({ missed: false, responseMs: 3000 }, GAME_CONFIG)).toEqual({
      outcome: 'correct',
      rating: 'good',
    });
  });

  it('is rated hard when found slowly, and wrong once either card was linked wrongly', () => {
    expect(bridgePairResult({ missed: false, responseMs: 60_000 }, GAME_CONFIG).rating).toBe(
      'hard',
    );
    expect(bridgePairResult({ missed: true, responseMs: 1000 }, GAME_CONFIG)).toEqual({
      outcome: 'wrong',
      rating: 'again',
    });
  });
});
