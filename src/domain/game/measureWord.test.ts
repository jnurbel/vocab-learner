import { describe, expect, it } from 'vitest';
import type { Card } from '../card';
import {
  DETERMINERS,
  groupsOf,
  isMeasureWordEligible,
  measureWordAnswer,
  measureWordQuestion,
  measureWordsOf,
} from './measureWord';

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

const table = new Map([
  ['朋友', ['个', '位']],
  ['书', ['册', '本', '部']],
  ['信封', ['个']],
  ['家庭', ['户']],
]);
const optionsByLevel = { 1: 3, 2: 4, 3: 4 } as const;

describe('the nouns a measure word can be asked on', () => {
  it('are the Chinese words of the table', () => {
    expect(isMeasureWordEligible(word('朋友'), table)).toBe(true);
    expect(isMeasureWordEligible(word('跑步'), table)).toBe(false);
    expect(isMeasureWordEligible(word('book', { language: 'en' }), table)).toBe(false);
  });

  it('read a word with spaces around it as the word', () => {
    expect(measureWordsOf(word(' 书 '), table)).toEqual(['册', '本', '部']);
  });
});

describe('a measure word question', () => {
  const ask = (term: string, level: 1 | 2 | 3, seed = 'seed') =>
    measureWordQuestion(word(term), table, { level, seed }, { optionsByLevel });

  it('puts a determiner before the gap, never 二', () => {
    const determiners = new Set(
      Array.from({ length: 40 }, (_, index) => ask('书', 2, String(index))?.determiner),
    );

    expect([...determiners].every((one) => DETERMINERS.includes(one ?? '二'))).toBe(true);
    expect(determiners.size).toBeGreaterThan(1);
  });

  it('offers 3 measure words at level 1, 4 at levels 2 and 3, one of them right', () => {
    expect(ask('书', 1)?.options).toHaveLength(3);
    expect(ask('书', 2)?.options).toHaveLength(4);
    expect(ask('书', 3)?.options).toHaveLength(4);
    expect(
      ask('书', 2)?.options.filter((option) => ['册', '本', '部'].includes(option)),
    ).toHaveLength(1);
  });

  it('prefers the usual measure word as the right option', () => {
    expect(ask('书', 2)?.options).toContain('本');
    expect(ask('书', 2)?.right).toEqual(['册', '本', '部']);
  });

  it('never offers 个, nor a measure word of the same group as a right one', () => {
    for (let index = 0; index < 50; index++) {
      const options = ask('朋友', 2, String(index))?.options ?? [];
      const wrong = options.filter((option) => option !== '个' && option !== '位');

      expect(wrong).not.toContain('个');
      expect(wrong.filter((option) => ['名', '口'].includes(option))).toEqual([]);
    }
  });

  it('keeps a measure word of another group even if it shares a group with a wrong one', () => {
    for (let index = 0; index < 50; index++) {
      const options = ask('书', 3, String(index))?.options ?? [];

      expect(options.filter((option) => ['册', '部'].includes(option))).toEqual([]);
    }
  });

  it('draws the wrong options among the most frequent measure words at level 3', () => {
    const frequent = ['本', '张', '条', '件', '只', '辆'];
    const options = ask('家庭', 3)?.options ?? [];

    expect(options.filter((option) => option !== '户').every((one) => frequent.includes(one))).toBe(
      true,
    );
  });

  it('is none for a noun outside the table', () => {
    expect(ask('跑步', 2)).toBeUndefined();
  });
});

describe('the answer to a measure word question', () => {
  const question = measureWordQuestion(
    word('书'),
    table,
    { level: 2, seed: 'seed' },
    { optionsByLevel },
  );

  it('is right for any measure word of the table, wrong otherwise', () => {
    if (question === undefined) {
      throw new Error('No question');
    }

    expect(measureWordAnswer(question, '本')).toBe('correct');
    expect(measureWordAnswer(question, '部')).toBe('correct');
    expect(measureWordAnswer(question, '张')).toBe('wrong');
    expect(measureWordAnswer(question, 'unknown')).toBe('wrong');
  });

  it('says what a measure word is for', () => {
    expect(groupsOf('本')).toEqual(['books']);
    expect(groupsOf('条')).toEqual(['animals', 'clothes', 'long']);
    expect(groupsOf('户')).toEqual([]);
  });
});
