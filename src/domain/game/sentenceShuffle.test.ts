import { describe, expect, it } from 'vitest';
import type { Card } from '../card';
import { createRng } from '../srs/random';
import { MINI_GAME_CONFIG } from './miniGameConfig';
import {
  correctPrefixLength,
  sameSentence,
  shuffleAnswer,
  shuffleChunks,
  shuffleSentenceOf,
  splitSentence,
  trapChunk,
} from './sentenceShuffle';

function word(term: string, overrides: Partial<Card> = {}): Card {
  return {
    id: term,
    language: 'zh',
    term,
    translation: `meaning of ${term}`,
    labelIds: [],
    source: 'manual',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('splitSentence', () => {
  it('cuts Chinese into words, the final punctuation stuck to the last one', () => {
    const chunks = splitSentence('我没有时间吃饭。', 'zh', MINI_GAME_CONFIG);

    expect(chunks.join('')).toBe('我没有时间吃饭。');
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    expect(chunks.at(-1)?.endsWith('。')).toBe(true);
    expect(chunks).not.toContain('。');
  });

  it('merges the smallest neighbouring pieces of a long sentence down to 8 chunks', () => {
    const sentence = '我们今天下午在学校的图书馆里面安安静静地看了很多很多有意思的书。';

    const chunks = splitSentence(sentence, 'zh', MINI_GAME_CONFIG);

    expect(chunks.length).toBeLessThanOrEqual(8);
    expect(chunks.join('')).toBe(sentence);
  });

  it('drops the spaces of a Chinese sentence and keeps an opening mark as a chunk start', () => {
    const chunks = splitSentence('「我 没有 时间」', 'zh', MINI_GAME_CONFIG);

    expect(chunks.join('')).toBe('「我没有时间」');
    expect(chunks[0]?.startsWith('「')).toBe(true);
  });

  it('cuts English on spaces, punctuation stuck to its word', () => {
    expect(splitSentence('  I like  cats, really! ', 'en', MINI_GAME_CONFIG)).toEqual([
      'I',
      'like',
      'cats,',
      'really!',
    ]);
  });
});

describe('shuffleSentenceOf', () => {
  it('keeps the examples of 3 to 8 chunks', () => {
    const en = (example: string) => word('cat', { language: 'en', example });

    expect(shuffleSentenceOf(en('I like cats.'), MINI_GAME_CONFIG)).toEqual(['I', 'like', 'cats.']);
    expect(shuffleSentenceOf(en('Cats sleep.'), MINI_GAME_CONFIG)).toBeUndefined();
    expect(shuffleSentenceOf(en('a b c d e f g h i'), MINI_GAME_CONFIG)).toBeUndefined();
    expect(shuffleSentenceOf(word('cat', { language: 'en' }), MINI_GAME_CONFIG)).toBeUndefined();
  });

  it('leaves out a sentence that reads the same in any order', () => {
    const en = word('ha', { language: 'en', example: 'ha ha ha' });

    expect(shuffleSentenceOf(en, MINI_GAME_CONFIG)).toBeUndefined();
  });
});

describe('shuffleChunks', () => {
  it('never gives the chunks in their own order, whatever the draw', () => {
    const chunks = ['I', 'like', 'cats.'];
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f']) {
      const shuffled = shuffleChunks(chunks, createRng(seed));

      expect(shuffled.join(' ')).not.toBe('I like cats.');
      expect([...shuffled].sort()).toEqual([...chunks].sort());
    }
  });

  it('turns the order round when the draw keeps it', () => {
    expect(shuffleChunks(['a', 'b', 'c'], () => 0.999)).toEqual(['c', 'b', 'a']);
  });

  it('turns the chunks by one when reversing them changes nothing', () => {
    expect(shuffleChunks(['a', 'b', 'a'], () => 0.999)).toEqual(['b', 'a', 'a']);
  });
});

describe('sameSentence', () => {
  it('ignores punctuation, spaces, width and case', () => {
    expect(sameSentence('我没有时间。', '我没有时间', 'zh')).toBe(true);
    expect(sameSentence('我没有时间！', '我没有时间!', 'zh')).toBe(true);
    expect(sameSentence('I like cats.', 'i like cats', 'en')).toBe(true);
    expect(sameSentence('I like cats.', 'cats like I', 'en')).toBe(false);
  });
});

describe('correctPrefixLength', () => {
  it('counts the chunks placed right from the start, comparing their text', () => {
    expect(correctPrefixLength(['I', 'cats.', 'like'], ['I', 'like', 'cats.'])).toBe(1);
    expect(correctPrefixLength(['ha', 'ha'], ['ha', 'ha'])).toBe(2);
    expect(correctPrefixLength([], ['I'])).toBe(0);
  });
});

describe('shuffleAnswer', () => {
  const chunks = ['I', 'like', 'cats.'];

  it('is right at the first try, right with a hint at the second, wrong otherwise', () => {
    expect(shuffleAnswer(['I', 'like', 'cats.'], chunks, 'en', 1)).toBe('correct');
    expect(shuffleAnswer(['I', 'like', 'cats.'], chunks, 'en', 2)).toBe('correctWithHint');
    expect(shuffleAnswer(['cats.', 'like', 'I'], chunks, 'en', 1)).toBe('wrong');
  });

  it('joins Chinese chunks without spaces', () => {
    expect(shuffleAnswer(['我', '没有', '时间。'], ['我', '没有', '时间。'], 'zh', 1)).toBe(
      'correct',
    );
  });

  it('accepts two identical chunks swapped, as the strings are compared', () => {
    expect(shuffleAnswer(['ha', 'ha', 'ho'], ['ha', 'ha', 'ho'], 'en', 1)).toBe('correct');
  });
});

describe('trapChunk', () => {
  const target = word('时间', { example: '我没有时间。', pinyin: 'shíjiān', labelIds: ['l1'] });

  it('adds the closest word of the same label that is not in the sentence', () => {
    const cards = [
      target,
      word('事件', { pinyin: 'shìjiàn', labelIds: ['l1'] }),
      word('猫', { pinyin: 'māo', labelIds: ['l1'] }),
      word('没有', { pinyin: 'méiyǒu', labelIds: ['l1'] }),
      word('实际', { pinyin: 'shíjì', labelIds: ['l2'] }),
    ];

    expect(trapChunk(target, cards, ['我', '没有', '时间。'], MINI_GAME_CONFIG)).toBe('事件');
  });

  it('takes a word of the language when the label has none, and none when there is none', () => {
    const other = word('实际', { pinyin: 'shíjì' });

    expect(trapChunk(target, [target, other], ['我', '没有', '时间。'], MINI_GAME_CONFIG)).toBe(
      '实际',
    );
    expect(trapChunk(target, [target], ['我', '没有', '时间。'], MINI_GAME_CONFIG)).toBeUndefined();
  });

  it('breaks a tie of proximity by the id of the word, for a stable trap', () => {
    const cards = [target, word('猫', { pinyin: 'māo' }), word('狗', { pinyin: 'gǒu' })];
    const [first] = ['猫', '狗'].sort((a, b) => a.localeCompare(b));

    expect(trapChunk(target, cards, ['我', '没有', '时间。'], MINI_GAME_CONFIG)).toBe(first);
  });
});
