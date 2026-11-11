import { describe, expect, it } from 'vitest';
import { textImportBatch, type TextWordChoice } from './textImportBatch';
import type { TextWord } from './textWords';

const mooncake: TextWord = {
  language: 'zh',
  term: '月饼',
  occurrences: 2,
  forms: [],
  sentence: '我们吃月饼。',
};
const moon: TextWord = {
  language: 'en',
  term: 'moon',
  occurrences: 1,
  forms: [],
  sentence: 'The moon is bright.',
};
const bright: TextWord = { language: 'en', term: 'bright', occurrences: 1, forms: [] };

function choices(entries: [TextWord, TextWordChoice][]): Map<string, TextWordChoice> {
  return new Map(entries.map(([word, choice]) => [`${word.language}:${word.term}`, choice]));
}

describe('textImportBatch', () => {
  it('turns the words to add into entries with their meaning, pinyin and sentence', () => {
    const { batch } = textImportBatch(
      [mooncake, moon],
      choices([
        [mooncake, { decision: 'add', pinyin: 'yue4bing3', translation: 'gâteau de lune' }],
        [moon, { decision: 'add', translation: 'lune' }],
      ]),
    );

    expect(batch).toEqual({
      entries: [
        {
          lineNumber: 1,
          language: 'zh',
          term: '月饼',
          pinyin: 'yuèbǐng',
          translation: 'gâteau de lune',
          example: '我们吃月饼。',
        },
        {
          lineNumber: 2,
          language: 'en',
          term: 'moon',
          translation: 'lune',
          example: 'The moon is bright.',
        },
      ],
      errors: [],
    });
  });

  it('adds a word without example when its sentence was too long to keep', () => {
    const { batch } = textImportBatch(
      [bright],
      choices([[bright, { decision: 'add', translation: 'vif' }]]),
    );

    expect(batch.entries[0]).not.toHaveProperty('example');
  });

  it('reports a word to add whose meaning is missing, located by its row', () => {
    const { batch } = textImportBatch([mooncake, moon], choices([[moon, { decision: 'add' }]]));

    expect(batch).toEqual({
      entries: [],
      errors: [{ lineNumber: 2, reason: 'missingTranslation' }],
    });
  });

  it('lists the words marked "I already know it" as terms to ignore from now on', () => {
    const { batch, ignoredTerms } = textImportBatch(
      [mooncake, moon],
      choices([[moon, { decision: 'known', translation: 'lune' }]]),
    );

    expect(ignoredTerms).toEqual([{ language: 'en', term: 'moon' }]);
    expect(batch.entries).toEqual([]);
  });

  it('leaves out the words skipped for this time, and those without a choice', () => {
    const { batch, ignoredTerms } = textImportBatch(
      [mooncake, moon],
      choices([[mooncake, { decision: 'skip', translation: 'gâteau' }]]),
    );

    expect(batch).toEqual({ entries: [], errors: [] });
    expect(ignoredTerms).toEqual([]);
  });
});
