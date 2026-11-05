import { describe, expect, it, vi } from 'vitest';
import type { BulkEntry } from './bulkEntryParser';
import { completeMissingPinyin } from './pinyinGeneration';

const fakeGenerator = (hanzi: string) => `pinyin-of-${hanzi}`;

describe('completeMissingPinyin', () => {
  it('generates the pinyin of Chinese words that have none', () => {
    const entries: BulkEntry[] = [
      { lineNumber: 1, language: 'zh', term: '你好', translation: 'bonjour' },
    ];

    expect(completeMissingPinyin(entries, fakeGenerator)).toEqual([
      {
        lineNumber: 1,
        language: 'zh',
        term: '你好',
        pinyin: 'pinyin-of-你好',
        translation: 'bonjour',
      },
    ]);
  });

  it('keeps the pinyin typed by the user and never adds pinyin to English words', () => {
    const generator = vi.fn(fakeGenerator);
    const entries: BulkEntry[] = [
      { lineNumber: 1, language: 'zh', term: '行', pinyin: 'xíng', translation: 'aller' },
      { lineNumber: 2, language: 'en', term: 'apple', translation: 'pomme' },
    ];

    expect(completeMissingPinyin(entries, generator)).toEqual(entries);
    expect(generator).not.toHaveBeenCalled();
  });

  it('leaves the pinyin missing when the generator finds nothing', () => {
    const entries: BulkEntry[] = [{ lineNumber: 1, language: 'zh', term: '㐀', translation: 'x' }];

    expect(completeMissingPinyin(entries, () => '  ')).toEqual(entries);
  });
});
