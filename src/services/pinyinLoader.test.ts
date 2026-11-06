import { describe, expect, it } from 'vitest';
import { loadPinyinGenerator } from './pinyinLoader';

describe('loadPinyinGenerator', () => {
  it('loads the offline pinyin generator on demand', async () => {
    const generate = await loadPinyinGenerator();

    expect(generate('你好')).toBe('nǐ hǎo');
  });
});
