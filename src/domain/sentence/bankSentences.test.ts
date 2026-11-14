import { describe, expect, it } from 'vitest';
import { bankSentencesFor, pickBankSentence } from './bankSentences';
import type { BankSentence, SentenceBank } from './sentenceData';

function sentence(id: number, cut: string): BankSentence {
  const words = cut.split(' ');
  return {
    id,
    author: 'sysko',
    words,
    text: words.join(''),
    translation: { lang: 'fr', id: id + 1000, author: 'Scott', text: 'Traduction.' },
    t2s: false,
    cc0: false,
  };
}

const bank: SentenceBank = {
  sentences: [
    sentence(1, '我 的 朋友 很 好 。'),
    sentence(2, '朋友 们 来 了 。'),
    sentence(3, '他 是 我 的 好朋友 。'),
    sentence(4, '我 的 朋友 喜欢 政治 。'),
    sentence(5, '你 白费力气 了 。'),
    sentence(6, '我 有 一个 朋友 ， 他 很 高 ， 也 很 好 ， 我们 每天 都 一起 玩 。'),
  ],
};

const known = new Set([
  '我',
  '的',
  '很',
  '好',
  '们',
  '来',
  '了',
  '他',
  '是',
  '你',
  '白',
  '气',
  '喜欢',
  '有',
  '一',
  '个',
  '高',
  '也',
  '我们',
  '每天',
  '都',
  '一起',
  '玩',
]);

describe('the bank sentences of a word', () => {
  it('are those holding the word whose other words are all known', () => {
    expect(bankSentencesFor('朋友', bank, known).map(({ id }) => id)).toEqual([1, 2, 3]);
  });

  it('accept a word glued to another one when the pair cuts into known words', () => {
    expect(bankSentencesFor('朋友', bank, known).map(({ id }) => id)).toContain(3);
  });

  it('leave out a sentence where the word is only part of a longer word', () => {
    expect(bankSentencesFor('费力', bank, new Set([...known, '费']))).toEqual([]);
  });

  it('leave out a sentence holding an unknown word', () => {
    expect(bankSentencesFor('朋友', bank, known).map(({ id }) => id)).not.toContain(4);
  });

  it('leave out sentences longer than 20 characters', () => {
    expect(bankSentencesFor('朋友', bank, known).map(({ id }) => id)).not.toContain(6);
  });

  it('are none for a blank word', () => {
    expect(bankSentencesFor(' ', bank, known)).toEqual([]);
  });
});

describe('the bank sentence asked', () => {
  const many = [
    sentence(10, '朋友 很 好 很 好 很 好 。'),
    sentence(11, '朋友 来 了 。'),
    sentence(12, '朋友 好 。'),
    sentence(13, '我 的 朋友 来 了 。'),
    sentence(14, '朋友 们 很 好 。'),
    sentence(15, '朋友 很 好 。'),
    sentence(16, '我 的 朋友 很 好 很 好 。'),
  ];

  it('is drawn among the shortest, the same for the same seed', () => {
    const picked = pickBankSentence(many, 'seed');

    expect([11, 12, 13, 14, 15]).toContain(picked?.id);
    expect(pickBankSentence(many, 'seed')).toBe(picked);
  });

  it('is not always the same sentence', () => {
    const ids = new Set(
      Array.from({ length: 30 }, (_, index) => pickBankSentence(many, `seed ${String(index)}`)?.id),
    );

    expect(ids.size).toBeGreaterThan(1);
  });

  it('is none without a sentence', () => {
    expect(pickBankSentence([], 'seed')).toBeUndefined();
  });
});
