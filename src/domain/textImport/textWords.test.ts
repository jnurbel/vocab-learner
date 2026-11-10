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
    expect(termsOf('2024年，我 3 次去北京。« Room 101 » 3D!')).toEqual([
      '年',
      '我',
      '次',
      '去',
      '北京',
      'room',
    ]);
  });

  it('leaves out obvious proper nouns: capitalized inside a sentence and never in lower case', () => {
    const terms = termsOf('Tom likes cats. Yesterday Tom met Anna in Paris. Cats like milk.');

    expect(terms).not.toContain('tom');
    expect(terms).not.toContain('anna');
    expect(terms).not.toContain('paris');
    expect(terms).toEqual(['likes', 'cats', 'yesterday', 'met', 'in', 'like', 'milk']);
  });

  it('keeps a capitalized word also written in lower case inside a sentence', () => {
    expect(termsOf('He said: Rain again. I like the rain.')).toContain('rain');
  });

  it('counts how many times each word appears', () => {
    const words = wordsOf('我们吃月饼。月饼很甜。Cake, cake and CAKE.');

    expect(words.find(({ term }) => term === '月饼')?.occurrences).toBe(2);
    expect(words.find(({ term }) => term === '我们')?.occurrences).toBe(1);
    expect(words.find(({ term }) => term === 'cake')?.occurrences).toBe(3);
  });

  it('keeps the sentence where the word first appears, trimmed, as its example', () => {
    const words = wordsOf('我们吃月饼。\n  月饼很甜！ The moon is bright. The moon rises.');

    expect(words.find(({ term }) => term === '月饼')?.sentence).toBe('我们吃月饼。');
    expect(words.find(({ term }) => term === '很甜')?.sentence).toBe('月饼很甜！');
    expect(words.find(({ term }) => term === 'moon')?.sentence).toBe('The moon is bright.');
    expect(words.find(({ term }) => term === 'rises')?.sentence).toBe('The moon rises.');
  });

  it('leaves the example out when the sentence is longer than a card example may be', () => {
    const longSentence = `${'very '.repeat(250)}long sentence.`;

    expect(wordsOf(longSentence).find(({ term }) => term === 'long')?.sentence).toBeUndefined();
  });

  it('keeps an English contraction as one word, whatever its apostrophe', () => {
    const terms = termsOf("I don’t know; you don't care.");

    expect(terms.filter((term) => term === "don't")).toHaveLength(1);
    expect(terms).not.toContain('don’t');
  });
});
