import { describe, expect, it } from 'vitest';
import { parseBulkEntry } from './bulkEntryParser';

function parsed(text: string) {
  const result = parseBulkEntry(text);
  if (!result.ok) {
    throw new Error(`Unexpected rejection: ${result.errors.join(', ')}`);
  }
  return result.value;
}

describe('parseBulkEntry', () => {
  it('reads a Chinese line "hanzi | pinyin | meaning" and converts numbered pinyin', () => {
    expect(parsed('谢谢 | xie4xie | merci')).toEqual({
      entries: [
        { lineNumber: 1, language: 'zh', term: '谢谢', pinyin: 'xièxie', translation: 'merci' },
      ],
      errors: [],
    });
  });

  it('reads an English line "word | meaning" and detects the language', () => {
    expect(parsed('apple | pomme').entries).toEqual([
      { lineNumber: 1, language: 'en', term: 'apple', translation: 'pomme' },
    ]);
  });

  it('detects Chinese from the presence of hanzi in the term, even mixed with latin letters', () => {
    expect(parsed('卡拉OK || karaoké').entries[0]?.language).toBe('zh');
    expect(parsed('T恤 || tee-shirt').entries[0]?.language).toBe('zh');
  });

  it('reads one word per line, skips blank lines and keeps the original line numbers', () => {
    const text = '\n你好 | ni3 hao3 | bonjour\r\n   \n\tapple | pomme\r\n\n';

    expect(parsed(text).entries).toEqual([
      { lineNumber: 2, language: 'zh', term: '你好', pinyin: 'nǐ hǎo', translation: 'bonjour' },
      { lineNumber: 4, language: 'en', term: 'apple', translation: 'pomme' },
    ]);
  });

  it('returns nothing for an empty input', () => {
    expect(parsed('')).toEqual({ entries: [], errors: [] });
    expect(parsed(' \n\n ')).toEqual({ entries: [], errors: [] });
  });
});
