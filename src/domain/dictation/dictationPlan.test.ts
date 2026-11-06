import { describe, expect, it } from 'vitest';
import type { Card } from '../card';
import { dictationPlan, type DictationOptions } from './dictationPlan';

function card(id: string, overrides: Partial<Card> = {}): Card {
  return {
    id,
    language: 'zh',
    term: id,
    translation: `meaning of ${id}`,
    labelIds: [],
    source: 'manual',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

const chinese = Array.from({ length: 25 }, (_, index) =>
  card(`zh${String(index)}`, { labelIds: index % 2 === 0 ? ['lesson7'] : [] }),
);
const english = [card('apple', { language: 'en' }), card('pear', { language: 'en' })];
const cards = [...chinese, ...english];

const options = (overrides: Partial<DictationOptions> = {}): DictationOptions => ({
  language: 'zh',
  labelIds: [],
  ...overrides,
});
const ids = (words: readonly Card[]) => words.map(({ id }) => id);

describe('dictationPlan', () => {
  it('dictates 10 words of the chosen language by default, in the order of the list', () => {
    const plan = dictationPlan(cards, options());

    expect(ids(plan.words)).toEqual(ids(chinese.slice(0, 10)));
  });

  it('keeps only the words of the chosen labels', () => {
    const plan = dictationPlan(cards, options({ labelIds: ['lesson7'], wordCount: 20 }));

    expect(plan.words).toHaveLength(13);
    expect(plan.words.every((word) => word.labelIds.includes('lesson7'))).toBe(true);
  });

  it('dictates between 5 and 20 words, and fewer when fewer are available', () => {
    expect(dictationPlan(cards, options({ wordCount: 7 })).words).toHaveLength(7);
    expect(dictationPlan(cards, options({ wordCount: 2 })).words).toHaveLength(5);
    expect(dictationPlan(cards, options({ wordCount: 50 })).words).toHaveLength(20);
    expect(dictationPlan(cards, options({ wordCount: Number.NaN })).words).toHaveLength(10);
    expect(dictationPlan(cards, options({ wordCount: 6.5 })).words).toHaveLength(6);
    expect(dictationPlan(cards, options({ language: 'en' })).words).toHaveLength(2);
  });
});
