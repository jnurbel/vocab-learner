import { describe, expect, it } from 'vitest';
import { extractTextWords, TEXT_IMPORT_LIMITS, type TextWord } from './textWords';

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
    const terms = termsOf('Tom likes cats. Yesterday Tom met Anna in Paris. Cats drink milk.');

    expect(terms).not.toContain('tom');
    expect(terms).not.toContain('anna');
    expect(terms).not.toContain('paris');
    expect(terms).toEqual(['likes', 'cats', 'yesterday', 'met', 'in', 'drink', 'milk']);
  });

  it('keeps a capitalized word also written in lower case inside a sentence', () => {
    expect(termsOf('He said: Rain again. I like the rain.')).toContain('rain');
  });

  it('groups the plural, -ed and -ing forms of an English word found in the text under it', () => {
    const words = wordsOf('The cat sleeps. Two cats play. Cats played and are playing.');

    expect(words.map(({ term }) => term)).toEqual([
      'the',
      'cat',
      'sleeps',
      'two',
      'play',
      'and',
      'are',
    ]);
    expect(words.find(({ term }) => term === 'cat')).toMatchObject({
      occurrences: 3,
      forms: ['cats'],
      sentence: 'The cat sleeps.',
    });
    expect(words.find(({ term }) => term === 'play')).toMatchObject({
      occurrences: 3,
      forms: ['played', 'playing'],
    });
  });

  it('keeps a form as it is when its base word is not in the text', () => {
    expect(wordsOf('She sleeps.').find(({ term }) => term === 'sleeps')?.forms).toEqual([]);
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

describe('extractTextWords on untrusted input', () => {
  it('refuses a text longer than 20 000 characters before any work', () => {
    expect(extractTextWords('a'.repeat(TEXT_IMPORT_LIMITS.characters + 1))).toEqual({
      ok: false,
      errors: ['inputTooLong'],
    });
  });

  it('accepts a text of exactly 20 000 characters', () => {
    expect(extractTextWords('a '.repeat(TEXT_IMPORT_LIMITS.characters / 2)).ok).toBe(true);
  });

  it('finds no word in a blank text', () => {
    expect(extractTextWords('  \n\t ')).toEqual({ ok: true, value: [] });
  });

  it('reads markup as plain text: tags give no words of their own, nothing is interpreted', () => {
    const terms = termsOf('<img src=x onerror="alert(1)"> hello <script>steal()</script>');

    expect(terms).toEqual(['img', 'src', 'x', 'onerror', 'alert', 'hello', 'script', 'steal']);
  });

  it('removes control characters and bidi overrides from the words and the example', () => {
    const words = wordsOf('Hel‮lo wor\u0000ld‏.');

    expect(words.map(({ term }) => term)).toEqual(['hello', 'world']);
    expect(words[0]?.sentence).toBe('Hello world.');
  });
});

describe('extractTextWords with the corrections of the learner', () => {
  it('tells which word follows the first appearance of each word, inside its sentence', () => {
    const words = wordsOf('今天是中秋节。I like ice cream.');

    expect(words.find(({ term }) => term === '中秋')?.followedBy).toBe('节');
    expect(words.find(({ term }) => term === '节')?.followedBy).toBeUndefined();
    expect(words.find(({ term }) => term === 'ice')?.followedBy).toBe('cream');
  });

  it('joins a word with the one that follows it, wherever they meet in the text', () => {
    const words = extractTextWords('今天是中秋节。中秋节快乐。中秋到了。', [
      { kind: 'join', first: '中秋', second: '节' },
    ]);

    expect(words.ok && words.value.find(({ term }) => term === '中秋节')).toMatchObject({
      occurrences: 2,
      sentence: '今天是中秋节。',
    });
    expect(words.ok && words.value.find(({ term }) => term === '中秋')?.occurrences).toBe(1);
  });

  it('joins two English words with a space', () => {
    const words = extractTextWords('I like ice cream, ice cream is good.', [
      { kind: 'join', first: 'ice', second: 'cream' },
    ]);

    expect(words.ok && words.value.map(({ term }) => term)).toContain('ice cream');
    expect(words.ok && words.value.map(({ term }) => term)).not.toContain('cream');
  });

  it('does not join words separated by punctuation', () => {
    const words = extractTextWords('Ice, cream.', [
      { kind: 'join', first: 'ice', second: 'cream' },
    ]);

    expect(words.ok && words.value.map(({ term }) => term)).toEqual(['ice', 'cream']);
  });

  it('cuts a Chinese word in two at the chosen character', () => {
    const words = extractTextWords('今天是中秋节。', [{ kind: 'split', term: '今天是', at: 2 }]);

    expect(words.ok && words.value.map(({ term }) => term)).toEqual(['今天', '是', '中秋', '节']);
  });

  it('applies the corrections in the order they were made', () => {
    const words = extractTextWords('今天是中秋节。', [
      { kind: 'split', term: '今天是', at: 2 },
      { kind: 'join', first: '是', second: '中秋' },
      { kind: 'join', first: '是中秋', second: '节' },
    ]);

    expect(words.ok && words.value.map(({ term }) => term)).toEqual(['今天', '是中秋节']);
  });

  it('ignores a cut outside the word', () => {
    const words = extractTextWords('今天是中秋节。', [
      { kind: 'split', term: '中秋', at: 0 },
      { kind: 'split', term: '中秋', at: 2 },
    ]);

    expect(words.ok && words.value.map(({ term }) => term)).toEqual(['今天是', '中秋', '节']);
  });
});
