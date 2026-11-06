import { describe, expect, it } from 'vitest';
import type { Card, Language } from '../card';
import { buildPracticeQueue, type PracticeQueueInput } from './practiceQueue';

function card(id: string, options: { language?: Language; labelIds?: string[] } = {}): Card {
  return {
    id,
    language: options.language ?? 'zh',
    term: id,
    translation: id,
    labelIds: options.labelIds ?? [],
    source: 'manual',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  };
}

function practice(overrides: Partial<PracticeQueueInput>) {
  return buildPracticeQueue({ cards: [], language: 'zh', seed: 'practice-1', ...overrides });
}

const ids = (cards: readonly Card[]) => cards.map(({ id }) => id).sort();

describe('buildPracticeQueue', () => {
  it('offers every word of the language, whatever its review state', () => {
    const cards = [card('a'), card('b'), card('apple', { language: 'en' }), card('c')];

    expect(ids(practice({ cards }))).toEqual(['a', 'b', 'c']);
  });

  it('keeps only the words of the chosen labels', () => {
    const cards = [card('a', { labelIds: ['animals'] }), card('b'), card('c', { labelIds: ['x'] })];

    expect(ids(practice({ cards, labelIds: ['animals', 'x'] }))).toEqual(['a', 'c']);
  });

  it('shuffles the words the same way for the same seed, whatever their input order', () => {
    const cards = 'abcdefghij'.split('').map((id) => card(id));

    const first = practice({ cards, seed: 'practice-1' }).map(({ id }) => id);
    const again = practice({ cards: [...cards].reverse(), seed: 'practice-1' }).map(({ id }) => id);
    const other = practice({ cards, seed: 'practice-2' }).map(({ id }) => id);

    expect(again).toEqual(first);
    expect(first).not.toEqual('abcdefghij'.split(''));
    expect(other).not.toEqual(first);
  });
});

describe('buildPracticeQueue with a limit', () => {
  const cards = 'abcdefghij'.split('').map((id) => card(id));

  it('keeps only the first words of the shuffled queue', () => {
    const all = practice({ cards });

    expect(practice({ cards, limit: 3 })).toEqual(all.slice(0, 3));
  });

  it('offers every word when the limit is larger than the selection', () => {
    expect(practice({ cards, limit: 50 })).toHaveLength(10);
    expect(practice({ cards, limit: Infinity })).toHaveLength(10);
  });

  it('rounds a fractional limit down and turns a malformed one into no word', () => {
    expect(practice({ cards, limit: 2.9 })).toHaveLength(2);
    expect(practice({ cards, limit: 0 })).toEqual([]);
    expect(practice({ cards, limit: -3 })).toEqual([]);
    expect(practice({ cards, limit: Number.NaN })).toEqual([]);
  });
});
