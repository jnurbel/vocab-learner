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

  it('converts every syllable of a spaced or glued sequence', () => {
    expect(numericToDiacritic('ni3 hao3')).toBe('nǐ hǎo');
    expect(numericToDiacritic('xie4xie')).toBe('xièxie');
    expect(numericToDiacritic('zhong1guo2ren2')).toBe('zhōngguórén');
  });

  it.each([
    ['ma5', 'ma'],
    ['ma0', 'ma'],
    ['xie4xie5', 'xièxie'],
  ])('drops the digit of a neutral tone: %s -> %s', (input, expected) => {
    expect(numericToDiacritic(input)).toBe(expected);
  });

  it.each([
    ['lv4', 'lǜ'],
    ['lu:4', 'lǜ'],
    ['nü3', 'nǚ'],
    ['lve4', 'lüè'],
    ['nv5', 'nü'],
  ])('writes the u-umlaut typed as v, u: or ü: %s -> %s', (input, expected) => {
    expect(numericToDiacritic(input)).toBe(expected);
  });

  it('keeps the case of capital letters', () => {
    expect(numericToDiacritic('Zhong1guo2')).toBe('Zhōngguó');
    expect(numericToDiacritic('BEI3JING1')).toBe('BĚIJĪNG');
    expect(numericToDiacritic('LV4')).toBe('LǛ');
    expect(numericToDiacritic('Ou1zhou1')).toBe('Ōuzhōu');
  });

  it.each(['nǐ hǎo', 'xièxie', 'lǜ', 'Zhōngguó', 'bonjour', ''])(
    'leaves text without tone digits unchanged: "%s"',
    (input) => {
      expect(numericToDiacritic(input)).toBe(input);
    },
  );

  it('converts only the numbered syllables of a partly accented input', () => {
    expect(numericToDiacritic('nǐ hao3')).toBe('nǐ hǎo');
  });

  it('returns composed characters even when the input is decomposed', () => {
    expect(numericToDiacritic('ni' + String.fromCodePoint(0x030c) + ' hao3')).toBe('nǐ hǎo');
  });

  it('puts the tone on a syllabic nasal when there is no vowel', () => {
    expect(numericToDiacritic('ng2')).toBe('ńg');
    expect(numericToDiacritic('m2')).toBe('ḿ');
  });

  it('keeps a syllable that cannot carry a tone mark as typed', () => {
    expect(numericToDiacritic('r5')).toBe('r');
    expect(numericToDiacritic('zh4')).toBe('zh4');
  });

  it('ignores digits that are not tones and stray numbers', () => {
    expect(numericToDiacritic('ma7')).toBe('ma7');
    expect(numericToDiacritic('HSK 4')).toBe('HSK 4');
    expect(numericToDiacritic('2026')).toBe('2026');
  });

  it('handles erhua written after the tone digit', () => {
    expect(numericToDiacritic('wan2r')).toBe('wánr');
    expect(numericToDiacritic('yi1dian3r')).toBe('yīdiǎnr');
  });
});
