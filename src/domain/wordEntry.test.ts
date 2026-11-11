import { describe, expect, it } from 'vitest';
import type { Card } from './card';
import { editCard, planWordEntry, type WordFields } from './wordEntry';

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

  it('reports a missing term and a missing meaning', () => {
    const outcome = planWordEntry(fields({ term: '  ', translation: '' }), [], context);

    expect(outcome).toEqual({
      ok: false,
      errors: [
        { field: 'term', reason: 'required' },
        { field: 'translation', reason: 'required' },
      ],
    });
  });

  it('rejects an over-long example instead of storing it', () => {
    const outcome = planWordEntry(
      fields({ term: 'cat', translation: 'chat', example: 'x'.repeat(1001) }),
      [],
      context,
    );

    expect(outcome).toEqual({ ok: false, errors: [{ field: 'example', reason: 'tooLong' }] });
  });

  it('keeps the example and ignores any pinyin typed for an English word', () => {
    const outcome = planWordEntry(
      fields({ term: 'cat', pinyin: 'mao1', translation: 'chat', example: 'The cat sleeps.' }),
      [],
      context,
    );

    expect(outcome.ok && outcome.value.card).toEqual(
      expect.objectContaining({ language: 'en', example: 'The cat sleeps.' }),
    );
    expect(outcome.ok && outcome.value.card).not.toHaveProperty('pinyin');
  });

  it('saves the senses typed with a vertical bar separated by a slash', () => {
    const outcome = planWordEntry(
      fields({ term: 'control', translation: 'contrôler | contrôle,surveiller' }),
      [],
      context,
    );

    expect(outcome.ok && outcome.value.card.translation).toBe('contrôler / contrôle, surveiller');
  });
});

describe('editCard', () => {
  const cat = existingCard({
    id: 'cat',
    term: '猫',
    pinyin: 'māo',
    translation: 'chat',
    example: '我有一只猫。',
    labelIds: ['animals'],
    source: 'csv',
  });
  const dog = existingCard({ id: 'dog', term: '狗', translation: 'chien' });

  it('changes the term, pinyin, meaning, example and labels, keeping the identity of the word', () => {
    const edited = editCard(
      cat,
      fields({
        term: '小猫',
        pinyin: 'xiao3 mao1',
        translation: 'chaton',
        example: '小猫很可爱。',
        labelIds: ['lesson'],
      }),
      [cat, dog],
      now,
    );

    expect(edited).toEqual({
      ok: true,
      value: {
        ...cat,
        term: '小猫',
        pinyin: 'xiǎo māo',
        translation: 'chaton',
        example: '小猫很可爱。',
        labelIds: ['lesson'],
        updatedAt: now,
      },
    });
  });

  it('removes a cleared pinyin and a cleared example', () => {
    const edited = editCard(cat, fields({ term: '猫', translation: 'chat' }), [cat], now);

    expect(edited.ok && edited.value).not.toHaveProperty('pinyin');
    expect(edited.ok && edited.value).not.toHaveProperty('example');
  });

  it('refuses a new term that is already another word', () => {
    const edited = editCard(cat, fields({ term: '狗', translation: 'chat' }), [cat, dog], now);

    expect(edited).toEqual({ ok: false, errors: [{ field: 'term', reason: 'duplicate' }] });
  });

  it('allows an English word to change only the case of its own term', () => {
    const apple = existingCard({ id: 'apple', language: 'en', term: 'apple' });

    const edited = editCard(apple, fields({ term: 'Apple', translation: 'pomme' }), [apple], now);

    expect(edited.ok && edited.value.term).toBe('Apple');
  });

  it('follows the language of the new term and drops the pinyin of a word that became English', () => {
    const edited = editCard(
      cat,
      fields({ term: 'cat', pinyin: 'māo', translation: 'chat' }),
      [cat],
      now,
    );

    expect(edited.ok && edited.value).toEqual(
      expect.objectContaining({ language: 'en', term: 'cat' }),
    );
    expect(edited.ok && edited.value).not.toHaveProperty('pinyin');
  });

  it('saves the edited senses separated by a slash rather than a vertical bar', () => {
    const edited = editCard(cat, fields({ term: '猫', translation: 'chat|minou' }), [cat], now);

    expect(edited.ok && edited.value.translation).toBe('chat / minou');
  });

  it('reports invalid fields without changing the word', () => {
    expect(editCard(cat, fields({ term: '猫' }), [cat], now)).toEqual({
      ok: false,
      errors: [{ field: 'translation', reason: 'required' }],
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
