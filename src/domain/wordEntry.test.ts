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
});
