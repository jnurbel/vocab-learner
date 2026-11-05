import { describe, expect, it } from 'vitest';
import type { BulkEntries } from './bulkEntryParser';
import type { Card } from './card';
import { planImport } from './importPlan';

function existingCard(overrides: Partial<Card> & Pick<Card, 'id' | 'term'>): Card {
  return {
    language: 'zh',
    translation: 'x',
    labelIds: [],
    source: 'manual',
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('planImport', () => {
  it('plans unknown words as new words carrying the chosen labels', () => {
    const batch: BulkEntries = {
      entries: [{ lineNumber: 1, language: 'en', term: 'apple', translation: 'pomme' }],
      errors: [],
    };

    expect(planImport(batch, [], ['lesson-7', 'fruits'])).toEqual({
      newWords: [
        {
          lineNumber: 1,
          language: 'en',
          term: 'apple',
          translation: 'pomme',
          labelIds: ['lesson-7', 'fruits'],
        },
      ],
      existingWords: [],
      errors: [],
    });
  });

  it('adds only the missing labels to a word that already exists, without duplicating it', () => {
    const cat = existingCard({ id: 'card-cat', term: '猫', labelIds: ['lesson-3'] });
    const batch: BulkEntries = {
      entries: [{ lineNumber: 2, language: 'zh', term: '猫', translation: 'chat' }],
      errors: [],
    };

    expect(planImport(batch, [cat], ['animals', 'lesson-3'])).toEqual({
      newWords: [],
      existingWords: [{ lineNumber: 2, card: cat, addedLabelIds: ['animals'] }],
      errors: [],
    });
  });

  it('matches existing English words regardless of case', () => {
    const apple = existingCard({ id: 'card-apple', language: 'en', term: 'Apple' });
    const batch: BulkEntries = {
      entries: [{ lineNumber: 1, language: 'en', term: 'apple', translation: 'pomme' }],
      errors: [],
    };

    expect(planImport(batch, [apple], ['fruits']).existingWords).toEqual([
      { lineNumber: 1, card: apple, addedLabelIds: ['fruits'] },
    ]);
  });

  it('does not confuse the same spelling in another language', () => {
    const chineseOk = existingCard({ id: 'card-ok', language: 'zh', term: 'OK' });
    const batch: BulkEntries = {
      entries: [{ lineNumber: 1, language: 'en', term: 'OK', translation: "d'accord" }],
      errors: [],
    };

    expect(planImport(batch, [chineseOk], []).newWords).toHaveLength(1);
  });

  it('keeps the line errors of the batch and ignores repeated chosen labels', () => {
    const batch: BulkEntries = {
      entries: [{ lineNumber: 1, language: 'en', term: 'pear', translation: 'poire' }],
      errors: [{ lineNumber: 2, reason: 'missingTranslation' }],
    };

    const plan = planImport(batch, [], ['fruits', 'fruits']);

    expect(plan.errors).toEqual([{ lineNumber: 2, reason: 'missingTranslation' }]);
    expect(plan.newWords[0]?.labelIds).toEqual(['fruits']);
  });
});
