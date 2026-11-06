import { describe, expect, it } from 'vitest';
import { pinyinProGenerator } from './pinyinProGenerator';

describe('pinyinProGenerator', () => {
  it('writes the pinyin of hanzi with tone marks, one syllable per character', () => {
    expect(pinyinProGenerator('你好')).toBe('nǐ hǎo');
  });

  it('chooses the reading of a polyphonic character from its word', () => {
    expect(pinyinProGenerator('银行')).toBe('yín háng');
    expect(pinyinProGenerator('行走')).toBe('xíng zǒu');
  });

  it('keeps latin letters of a mixed word together', () => {
    expect(pinyinProGenerator('卡拉OK')).toBe('kǎ lā OK');
  });

  it('returns an empty pinyin for an empty term', () => {
    expect(pinyinProGenerator('')).toBe('');
  });
});
