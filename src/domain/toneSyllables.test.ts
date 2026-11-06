import { describe, expect, it } from 'vitest';
import { toneSegments } from './toneSyllables';

describe('toneSegments', () => {
  it('gives each syllable its tone, from 1 to 4 or neutral, keeping the separators as plain text', () => {
    expect(toneSegments('mā má mǎ mà ma')).toEqual([
      { text: 'mā', tone: 1 },
      { text: ' ' },
      { text: 'má', tone: 2 },
      { text: ' ' },
      { text: 'mǎ', tone: 3 },
      { text: ' ' },
      { text: 'mà', tone: 4 },
      { text: ' ' },
      { text: 'ma', tone: 'neutral' },
    ]);
  });

  it('splits syllables written together', () => {
    expect(toneSegments('xièxie')).toEqual([
      { text: 'xiè', tone: 4 },
      { text: 'xie', tone: 'neutral' },
    ]);
    expect(toneSegments('Běijīng Zhōngguó')).toEqual([
      { text: 'Běi', tone: 3 },
      { text: 'jīng', tone: 1 },
      { text: ' ' },
      { text: 'Zhōng', tone: 1 },
      { text: 'guó', tone: 2 },
    ]);
  });

  it('gives a consonant followed by a vowel to the next syllable', () => {
    expect(toneSegments('xīnián')).toEqual([
      { text: 'xī', tone: 1 },
      { text: 'nián', tone: 2 },
    ]);
    expect(toneSegments('kěrén')).toEqual([
      { text: 'kě', tone: 3 },
      { text: 'rén', tone: 2 },
    ]);
  });

  it('reads the tone on ü, on ê and on a syllable ending with the erhua r', () => {
    expect(toneSegments('lǜ nǚér lüè ê̄ huār')).toEqual([
      { text: 'lǜ', tone: 4 },
      { text: ' ' },
      { text: 'nǚ', tone: 3 },
      { text: 'ér', tone: 2 },
      { text: ' ' },
      { text: 'lüè', tone: 4 },
      { text: ' ' },
      { text: 'ê̄', tone: 1 },
      { text: ' ' },
      { text: 'huār', tone: 1 },
    ]);
  });

  it('keeps as plain text any word that is not pinyin, together with the separators around it', () => {
    expect(toneSegments('nǐ (fam.) 你 x')).toEqual([
      { text: 'nǐ', tone: 3 },
      { text: ' (fam.) 你 x' },
    ]);
  });

  it('returns nothing for an empty pinyin', () => {
    expect(toneSegments('')).toEqual([]);
  });

  it('copes with a long hostile input without catastrophic backtracking', () => {
    const hostile = 'a'.repeat(5000) + '!';
    const started = performance.now();

    const segments = toneSegments(hostile);

    expect(segments.map(({ text }) => text).join('')).toBe(hostile);
    expect(performance.now() - started).toBeLessThan(1000);
  });
});
