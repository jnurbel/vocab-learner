import { describe, expect, it } from 'vitest';
import { CARD_LIMITS, createCard, termKey } from './card';

const context = { id: 'card-1', now: '2026-11-05T10:00:00.000Z' };

describe('createCard', () => {
  it('creates a word with a trimmed term and translation, no labels and timestamps', () => {
    const result = createCard(
      { language: 'zh', term: '  你好 ', translation: ' bonjour  ', source: 'manual' },
      context,
    );

    expect(result).toEqual({
      ok: true,
      value: {
        id: 'card-1',
        language: 'zh',
        term: '你好',
        translation: 'bonjour',
        labelIds: [],
        source: 'manual',
        createdAt: context.now,
        updatedAt: context.now,
      },
    });
  });

  it('rejects a term that is blank once trimmed', () => {
    const result = createCard(
      { language: 'en', term: ' \t ', translation: 'pomme', source: 'manual' },
      context,
    );

    expect(result).toEqual({ ok: false, errors: [{ field: 'term', reason: 'required' }] });
  });

  it('rejects a translation that is blank once trimmed', () => {
    const result = createCard(
      { language: 'en', term: 'apple', translation: '   ', source: 'manual' },
      context,
    );

    expect(result).toEqual({ ok: false, errors: [{ field: 'translation', reason: 'required' }] });
  });

  it('reports every invalid field at once', () => {
    const result = createCard(
      { language: 'en', term: '', translation: '', source: 'manual' },
      context,
    );

    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors.map((error) => error.field)).toEqual([
      'term',
      'translation',
    ]);
  });

  it('accepts a term exactly at the maximum length', () => {
    const term = 'a'.repeat(CARD_LIMITS.term);

    const result = createCard(
      { language: 'en', term, translation: 'x', source: 'manual' },
      context,
    );

    expect(result.ok).toBe(true);
  });

  it('rejects fields longer than their maximum length', () => {
    const result = createCard(
      {
        language: 'zh',
        term: '字'.repeat(CARD_LIMITS.term + 1),
        pinyin: 'a'.repeat(CARD_LIMITS.pinyin + 1),
        translation: 'a'.repeat(CARD_LIMITS.translation + 1),
        example: 'a'.repeat(CARD_LIMITS.example + 1),
        source: 'manual',
      },
      context,
    );

    expect(result).toEqual({
      ok: false,
      errors: [
        { field: 'term', reason: 'tooLong' },
        { field: 'pinyin', reason: 'tooLong' },
        { field: 'translation', reason: 'tooLong' },
        { field: 'example', reason: 'tooLong' },
      ],
    });
  });

  it('keeps trimmed pinyin and example, and drops them when blank', () => {
    const withExtras = createCard(
      {
        language: 'zh',
        term: '你好',
        pinyin: ' nǐ hǎo ',
        translation: 'bonjour',
        example: ' 你好吗？ ',
        source: 'manual',
      },
      context,
    );
    const withBlankExtras = createCard(
      {
        language: 'zh',
        term: '你好',
        pinyin: ' ',
        translation: 'bonjour',
        example: '',
        source: 'manual',
      },
      context,
    );

    expect(withExtras.ok && withExtras.value).toMatchObject({
      pinyin: 'nǐ hǎo',
      example: '你好吗？',
    });
    expect(withBlankExtras.ok && withBlankExtras.value).not.toHaveProperty('pinyin');
    expect(withBlankExtras.ok && withBlankExtras.value).not.toHaveProperty('example');
  });

  it('keeps the given labels without duplicates', () => {
    const result = createCard(
      {
        language: 'en',
        term: 'cat',
        translation: 'chat',
        labelIds: ['animals', 'lesson-3', 'animals'],
        source: 'manual',
      },
      context,
    );

    expect(result.ok && result.value.labelIds).toEqual(['animals', 'lesson-3']);
  });
});

describe('termKey', () => {
  it('identifies an English word regardless of case and surrounding spaces', () => {
    expect(termKey('en', ' Apple ')).toBe(termKey('en', 'apple'));
  });

  it('identifies a word regardless of its Unicode normalization form', () => {
    expect(termKey('en', 'cafe' + String.fromCodePoint(0x0301))).toBe(termKey('en', 'café'));
  });

  it('distinguishes the same spelling in two languages', () => {
    expect(termKey('zh', 'OK')).not.toBe(termKey('en', 'OK'));
  });
});
