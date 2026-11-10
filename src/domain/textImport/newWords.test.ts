import { describe, expect, it } from 'vitest';
import type { Language } from '../card';
import { keepNewWords, type NewWordFilter } from './newWords';
import type { TextWord } from './textWords';

function word(language: Language, term: string): TextWord {
  return { language, term, occurrences: 1, forms: [] };
}

const noFilter: NewWordFilter = { knownTerms: [], ignoredTerms: [], hideCommonWords: false };

function termsKept(words: TextWord[], filter: Partial<NewWordFilter>): string[] {
  return keepNewWords(words, { ...noFilter, ...filter }).map(({ term }) => term);
}

describe('keepNewWords', () => {
  it('keeps every word when the list is empty and nothing is ignored', () => {
    expect(termsKept([word('zh', '月饼'), word('en', 'moon')], {})).toEqual(['月饼', 'moon']);
  });

  it('leaves out the words already in the list, by language and term', () => {
    const words = [word('zh', '月饼'), word('en', 'moon'), word('en', 'cake')];

    expect(
      termsKept(words, {
        knownTerms: [
          { language: 'zh', term: '月饼' },
          { language: 'en', term: 'Moon' },
          { language: 'zh', term: 'cake' },
        ],
      }),
    ).toEqual(['cake']);
  });

  it('leaves out an English form whose base word is already in the list', () => {
    expect(
      termsKept([word('en', 'cats'), word('en', 'played')], {
        knownTerms: [
          { language: 'en', term: 'cat' },
          { language: 'en', term: 'play' },
        ],
      }),
    ).toEqual([]);
  });

  it('leaves out the words marked "I already know it"', () => {
    expect(
      termsKept([word('zh', '月饼'), word('en', 'moon')], {
        ignoredTerms: [{ language: 'en', term: 'moon' }],
      }),
    ).toEqual(['月饼']);
  });

  it('keeps the very common words unless asked to hide them', () => {
    const words = [word('zh', '的'), word('zh', '月饼'), word('en', 'the'), word('en', 'moon')];

    expect(termsKept(words, { hideCommonWords: false })).toEqual(['的', '月饼', 'the', 'moon']);
    expect(termsKept(words, { hideCommonWords: true })).toEqual(['月饼', 'moon']);
  });
});
