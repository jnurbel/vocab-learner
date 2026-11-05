import { describe, expect, it } from 'vitest';
import type { Card, Language } from './card';
import { selectCards } from './cardSelection';

function card(id: string, labelIds: string[], language: Language): Card {
  return {
    id,
    language,
    term: id,
    translation: id,
    labelIds,
    source: 'manual',
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
  };
}

const cat = card('猫', ['lesson-3', 'animals'], 'zh');
const book = card('书', ['lesson-3'], 'zh');
const dog = card('dog', ['animals'], 'en');
const apple = card('apple', [], 'en');
const allCards = [cat, book, dog, apple];

describe('selectCards', () => {
  it('selects the words of overlapping labels once each, in list order', () => {
    expect(selectCards(allCards, { labelIds: ['animals', 'lesson-3'] })).toEqual([cat, book, dog]);
  });

  it('keeps only the words of the requested language', () => {
    expect(selectCards(allCards, { labelIds: ['animals'], language: 'en' })).toEqual([dog]);
  });

  it('selects every word, labelled or not, when no label is requested', () => {
    expect(selectCards(allCards, { labelIds: [] })).toEqual(allCards);
    expect(selectCards(allCards, { labelIds: [], language: 'en' })).toEqual([dog, apple]);
  });

  it('selects nothing for a label that no word carries', () => {
    expect(selectCards(allCards, { labelIds: ['unknown'] })).toEqual([]);
  });

  it('never returns the same word twice even if the list repeats it', () => {
    expect(selectCards([cat, { ...cat }], { labelIds: ['animals', 'lesson-3'] })).toEqual([cat]);
  });
});
