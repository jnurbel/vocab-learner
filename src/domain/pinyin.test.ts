import { describe, expect, it } from 'vitest';
import { numericToDiacritic } from './pinyin';

describe('numericToDiacritic', () => {
  it.each([
    ['ma1', 'mā'],
    ['ma2', 'má'],
    ['ma3', 'mǎ'],
    ['ma4', 'mà'],
  ])('marks the tone of a single syllable: %s -> %s', (input, expected) => {
    expect(numericToDiacritic(input)).toBe(expected);
  });

  it.each([
    ['hao3', 'hǎo', 'a wins over o'],
    ['xie4', 'xiè', 'e wins over i'],
    ['guai4', 'guài', 'a wins over u and i'],
    ['dou1', 'dōu', 'o of "ou"'],
    ['zhou1', 'zhōu', 'o of "ou" after a consonant cluster'],
    ['liu2', 'liú', 'last vowel of "iu"'],
    ['gui4', 'guì', 'last vowel of "ui"'],
    ['duo1', 'duō', 'last vowel of "uo"'],
    ['xi3', 'xǐ', 'single i'],
    ['wo3', 'wǒ', 'single o'],
    ['zhu4', 'zhù', 'single u'],
  ])('places the tone mark by the standard rule: %s -> %s (%s)', (input, expected) => {
    expect(numericToDiacritic(input)).toBe(expected);
  });
});
