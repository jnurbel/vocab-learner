import { describe, expect, it } from 'vitest';
import type { HskWord } from './sentenceData';
import {
  createKnownWords,
  knownWordsOf,
  segmentChinese,
  splitIntoKnown,
  splitNumbers,
} from './words';

const hsk = new Map<string, HskWord>([
  ['我', { level: 1, pos: ['r'] }],
  ['去', { level: 1, pos: ['v'] }],
  ['睡觉', { level: 1, pos: ['v'] }],
  ['书', { level: 1, pos: ['n'] }],
  ['本', { level: 1, pos: ['q'] }],
  ['政府', { level: 5, pos: ['n'] }],
]);

describe('the words a learner knows', () => {
  it('are the HSK 1 to 3 words and the words of their own list', () => {
    const known = createKnownWords(hsk, ['政府', ' 信封 ', '  ']);

    expect(known.has('睡觉')).toBe(true);
    expect(known.has('政府')).toBe(true);
    expect(known.has('信封')).toBe(true);
    expect(known.has('概念')).toBe(false);
    expect(known.has('')).toBe(false);
  });

  it('leave out an HSK word above level 3 that is not in the list', () => {
    expect(createKnownWords(hsk, []).has('政府')).toBe(false);
  });

  it('include the grammar particles and the names common in the bank', () => {
    const known = createKnownWords(new Map(), []);

    expect(known.has('了')).toBe(true);
    expect(known.has('汤姆')).toBe(true);
  });
});

describe('splitting an unknown word into known words', () => {
  const known = createKnownWords(hsk, []);

  it('cuts it into known words, longest first', () => {
    expect(splitIntoKnown('去睡觉', known)).toEqual(['去', '睡觉']);
  });

  it('gives nothing when a piece stays unknown', () => {
    expect(splitIntoKnown('去概念', known)).toBeUndefined();
  });

  it('keeps the words of a sentence, an unknown one cut when it can be', () => {
    expect(knownWordsOf(['我', '去睡觉', '概念', '。'], known)).toEqual([
      { word: '我', known: true },
      { word: '去', known: true },
      { word: '睡觉', known: true },
      { word: '概念', known: false },
      { word: '。', known: true },
    ]);
  });

  it('counts numbers and punctuation as known', () => {
    expect(knownWordsOf(['三十', '2026', '！'], known).every((word) => word.known)).toBe(true);
  });
});

describe('cutting a Chinese sentence', () => {
  it('gives its words and punctuation, without spaces', () => {
    const words = segmentChinese('我 有书。');

    expect(words.join('')).toBe('我有书。');
    expect(words).not.toContain(' ');
    expect(words.at(-1)).toBe('。');
  });

  it('reads at most 200 characters of a pasted text', () => {
    expect(segmentChinese('好'.repeat(500)).join('').length).toBeLessThanOrEqual(200);
  });
});

describe('a number glued to what follows it', () => {
  const classifiers = new Set(['本', '个']);
  const nouns = new Set(['书']);

  it('is cut from its measure word, and the measure word from its noun', () => {
    expect(splitNumbers(['我', '有', '三本书', '。'], classifiers, nouns)).toEqual([
      '我',
      '有',
      '三',
      '本',
      '书',
      '。',
    ]);
  });

  it('is cut from a noun that follows it without measure word', () => {
    expect(splitNumbers(['三书'], classifiers, nouns)).toEqual(['三', '书']);
  });

  it('is cut from the word before it when a noun or measure word follows', () => {
    expect(splitNumbers(['他', '有三', '妹妹'], classifiers, new Set(['妹妹']))).toEqual([
      '他',
      '有',
      '三',
      '妹妹',
    ]);
    expect(splitNumbers(['有三', '个'], classifiers, nouns)).toEqual(['有', '三', '个']);
    expect(splitNumbers(['统一', '思想'], classifiers, nouns)).toEqual(['统一', '思想']);
    expect(splitNumbers(['我有三'], classifiers, nouns)).toEqual(['我有三']);
    expect(splitNumbers(['三十', '个'], classifiers, nouns)).toEqual(['三十', '个']);
  });

  it('stays whole when nothing known follows it', () => {
    expect(splitNumbers(['一般', '三十', '三个'], classifiers, nouns)).toEqual([
      '一般',
      '三十',
      '三',
      '个',
    ]);
  });
});
