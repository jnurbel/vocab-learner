import { describe, expect, it } from 'vitest';
import type { Card } from './card';
import { planWordEntry, type WordFields } from './wordEntry';

const now = '2026-11-06T09:00:00.000Z';
const context = { id: 'new-id', now };

function fields(overrides: Partial<WordFields>): WordFields {
  return { term: '', pinyin: '', translation: '', example: '', labelIds: [], ...overrides };
}

describe('planWordEntry', () => {
  it('creates a new Chinese word with its numbered pinyin converted to tone marks', () => {
    const outcome = planWordEntry(
      fields({ term: '你好', pinyin: 'ni3 hao3', translation: 'bonjour', labelIds: ['l1'] }),
      [],
      context,
    );

    expect(outcome).toEqual({
      ok: true,
      value: {
        kind: 'created',
        card: {
          id: 'new-id',
          language: 'zh',
          term: '你好',
          pinyin: 'nǐ hǎo',
          translation: 'bonjour',
          labelIds: ['l1'],
          source: 'manual',
          createdAt: now,
          updatedAt: now,
        } satisfies Card,
      },
    });
  });

  it('does not duplicate an existing word: it only receives the labels it lacks', () => {
    const cat = existingCard({ id: 'cat', term: '猫', labelIds: ['lesson'] });

    const outcome = planWordEntry(
      fields({ term: ' 猫 ', translation: 'autre sens', labelIds: ['lesson', 'animals'] }),
      [cat],
      context,
    );

    expect(outcome).toEqual({
      ok: true,
      value: {
        kind: 'labelsAdded',
        card: { ...cat, labelIds: ['lesson', 'animals'], updatedAt: now },
        addedLabelIds: ['animals'],
      },
    });
  });

  it('recognises an existing English word whatever its case', () => {
    const apple = existingCard({ id: 'apple', language: 'en', term: 'apple', labelIds: [] });

    const outcome = planWordEntry(
      fields({ term: 'Apple', translation: 'pomme', labelIds: [] }),
      [apple],
      context,
    );

    expect(outcome).toEqual({
      ok: true,
      value: { kind: 'alreadyPresent', card: apple },
    });
  });
});

function existingCard(overrides: Partial<Card>): Card {
  return {
    id: 'existing',
    language: 'zh',
    term: '猫',
    translation: 'chat',
    labelIds: [],
    source: 'manual',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}
