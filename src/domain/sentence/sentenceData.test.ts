import { describe, expect, it } from 'vitest';
import {
  parseHskWords,
  parseMeasureWords,
  parseSentenceBank,
  SENTENCE_DATA_LIMITS,
} from './sentenceData';

const meta = { source: 'test', license: 'test' };
/** Written as a code point: a raw one would hide in the source itself. */
const RIGHT_TO_LEFT_OVERRIDE = String.fromCodePoint(0x202e);

function bankFile(overrides: Record<string, unknown> = {}) {
  return {
    _meta: meta,
    format: 'vocab-learner-sentences',
    version: 1,
    authors: ['Tatoeba contributors', 'sysko', 'Scott'],
    sentences: [
      [2, 1, '我 该 去 睡觉 了 。', 'fr', 10, 2, 'Je dois aller dormir.'],
      [3, 0, '你 在 干 什么 啊 ？', 'en', 11, 1, 'What are you doing?', { t2s: true }],
    ],
    ...overrides,
  };
}

describe('the sentence bank file', () => {
  it('gives each sentence its words, its translation and the authors of both', () => {
    const parsed = parseSentenceBank(bankFile());

    expect(parsed.ok && parsed.value.sentences[0]).toEqual({
      id: 2,
      author: 'sysko',
      words: ['我', '该', '去', '睡觉', '了', '。'],
      text: '我该去睡觉了。',
      translation: { lang: 'fr', id: 10, author: 'Scott', text: 'Je dois aller dormir.' },
      t2s: false,
      cc0: false,
    });
  });

  it('keeps the converted and public domain marks of a sentence', () => {
    const parsed = parseSentenceBank(
      bankFile({
        sentences: [[5, 0, '好 。', 'en', 6, 0, 'Good.', { t2s: true, license: 'CC0-1.0' }]],
      }),
    );

    expect(parsed.ok && parsed.value.sentences[0]).toMatchObject({ t2s: true, cc0: true });
  });

  it('refuses another format, version or unexpected field', () => {
    expect(parseSentenceBank(bankFile({ format: 'other' })).ok).toBe(false);
    expect(parseSentenceBank(bankFile({ version: 2 })).ok).toBe(false);
    expect(parseSentenceBank(bankFile({ extra: true })).ok).toBe(false);
    expect(parseSentenceBank('not an object').ok).toBe(false);
  });

  it('refuses an author that is not in the table of authors', () => {
    const parsed = parseSentenceBank(bankFile({ sentences: [[2, 7, '好', 'fr', 10, 0, 'Bien.']] }));

    expect(parsed.ok).toBe(false);
  });

  it('refuses hidden controls, empty words and over-long texts', () => {
    const sentence = (words: string, translation: string) =>
      bankFile({ sentences: [[2, 0, words, 'fr', 10, 0, translation]] });

    expect(parseSentenceBank(sentence('好', `Bien${RIGHT_TO_LEFT_OVERRIDE}.`)).ok).toBe(false);
    expect(parseSentenceBank(sentence('好  吗', 'Bien.')).ok).toBe(false);
    expect(parseSentenceBank(sentence('好'.repeat(41), 'Bien.')).ok).toBe(false);
    expect(parseSentenceBank(sentence('好', 'B'.repeat(301))).ok).toBe(false);
  });

  it('refuses a translation in another language than French or English', () => {
    const parsed = parseSentenceBank(bankFile({ sentences: [[2, 0, '好', 'de', 10, 0, 'Gut.']] }));

    expect(parsed.ok).toBe(false);
  });

  it('refuses more sentences than the bank may hold', () => {
    const sentences = Array.from({ length: SENTENCE_DATA_LIMITS.sentences + 1 }, (_, index) => [
      index + 1,
      0,
      '好',
      'fr',
      1,
      0,
      'Bien.',
    ]);

    expect(parseSentenceBank(bankFile({ sentences })).ok).toBe(false);
  });
});

describe('the measure words file', () => {
  it('gives the measure words of each noun', () => {
    const parsed = parseMeasureWords({
      _meta: meta,
      format: 'vocab-learner-measure-words',
      version: 1,
      nouns: { 朋友: ['个', '位'], 书: ['本'] },
    });

    expect(parsed.ok && parsed.value.get('朋友')).toEqual(['个', '位']);
  });

  it('refuses a noun without measure word, or one that is not Chinese', () => {
    const file = (nouns: Record<string, string[]>) => ({
      _meta: meta,
      format: 'vocab-learner-measure-words',
      version: 1,
      nouns,
    });

    expect(parseMeasureWords(file({ 书: [] })).ok).toBe(false);
    expect(parseMeasureWords(file({ book: ['本'] })).ok).toBe(false);
    expect(parseMeasureWords(file({ 书: ['<b>'] })).ok).toBe(false);
  });

  it('never gives a noun inherited from the prototype', () => {
    const parsed = parseMeasureWords({
      _meta: meta,
      format: 'vocab-learner-measure-words',
      version: 1,
      nouns: { 书: ['本'] },
    });

    expect(parsed.ok && parsed.value.get('constructor')).toBeUndefined();
  });
});

describe('the HSK words file', () => {
  it('gives the level and the parts of speech of each word', () => {
    const parsed = parseHskWords({
      _meta: meta,
      format: 'vocab-learner-hsk-words',
      version: 1,
      words: { 高: [1, 'a'], 朋友: [1, 'n'], 学习: [1, 'v vn'] },
    });

    expect(parsed.ok && parsed.value.get('学习')).toEqual({ level: 1, pos: ['v', 'vn'] });
  });

  it('refuses a level outside 1 to 6', () => {
    const parsed = parseHskWords({
      _meta: meta,
      format: 'vocab-learner-hsk-words',
      version: 1,
      words: { 高: [7, 'a'] },
    });

    expect(parsed.ok).toBe(false);
  });
});
