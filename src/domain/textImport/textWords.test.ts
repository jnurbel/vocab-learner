import { describe, expect, it } from 'vitest';
import { extractTextWords, type TextWord } from './textWords';

function termsOf(text: string): string[] {
  const extracted = extractTextWords(text);
  if (!extracted.ok) {
    throw new Error(`Unexpected failure: ${extracted.errors.join(', ')}`);
  }
  return extracted.value.map(({ term }) => term);
}

function wordsOf(text: string): TextWord[] {
  const extracted = extractTextWords(text);
  if (!extracted.ok) {
    throw new Error(`Unexpected failure: ${extracted.errors.join(', ')}`);
  }
  return extracted.value;
}

describe('extractTextWords', () => {
  it('splits a Chinese text into its words, each listed once in order of appearance', () => {
    expect(termsOf('我们吃月饼。月饼很甜。')).toEqual(['我们', '吃', '月饼', '很甜']);
  });

  it('marks the words of a Chinese text as Chinese', () => {
    expect(wordsOf('月饼').map(({ language }) => language)).toEqual(['zh']);
  });

  it('lowers the case of English words and marks them as English', () => {
    expect(wordsOf('Rain falls. rain stops.')).toEqual([
      expect.objectContaining({ language: 'en', term: 'rain' }),
      expect.objectContaining({ language: 'en', term: 'falls' }),
      expect.objectContaining({ language: 'en', term: 'stops' }),
    ]);
  });

  it('leaves out punctuation, numbers and words mixing digits', () => {
    expect(termsOf('2024年，我 3 次去北京。« Room 101 » 3D!')).toEqual(['年', '我', '次', '去', '北京', 'room']);
  });

  it('keeps an English contraction as one word, whatever its apostrophe', () => {
    const terms = termsOf("I don’t know; you don't care.");

    expect(terms.filter((term) => term === "don't")).toHaveLength(1);
    expect(terms).not.toContain('don’t');
  });
});
