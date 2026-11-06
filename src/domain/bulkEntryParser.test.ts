import { describe, expect, it } from 'vitest';
import { BULK_ENTRY_LIMITS, parseBulkEntry } from './bulkEntryParser';
import { CARD_LIMITS } from './card';

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

  it.each([
    ['a pipe', '你好 | nǐ hǎo | bonjour'],
    ['a tab', '你好\tnǐ hǎo\tbonjour'],
    ['a semicolon', '你好 ; nǐ hǎo ; bonjour'],
  ])('accepts %s as the separator', (_name, line) => {
    expect(parsed(line).entries).toEqual([
      { lineNumber: 1, language: 'zh', term: '你好', pinyin: 'nǐ hǎo', translation: 'bonjour' },
    ]);
  });

  it('keeps semicolons and tabs inside a meaning when the line uses pipes', () => {
    expect(parsed('apple | pomme; fruit').entries[0]?.translation).toBe('pomme; fruit');
  });

  it.each([
    ['an empty pinyin column', '你好 || bonjour'],
    ['a blank pinyin column', '你好 |   | bonjour'],
    ['no pinyin column', '你好 | bonjour'],
  ])('leaves the pinyin to generate when given %s', (_name, line) => {
    expect(parsed(line).entries).toEqual([
      { lineNumber: 1, language: 'zh', term: '你好', translation: 'bonjour' },
    ]);
  });

  it('ignores a byte order mark pasted from a spreadsheet', () => {
    expect(parsed(String.fromCodePoint(0xfeff) + 'apple | pomme').entries[0]?.term).toBe('apple');
  });

  it.each([
    ['a single column', 'apple', 'missingTranslation'],
    ['an empty meaning', '你好 | nǐ hǎo |  ', 'missingTranslation'],
    ['an empty term', ' | pomme', 'missingTerm'],
    ['only separators', '| |', 'missingTerm'],
    ['too many columns', '你好 | nǐ hǎo | bonjour | salut', 'tooManyColumns'],
    ['a pinyin on an English word', 'apple | æpl | pomme', 'pinyinNotAllowed'],
    ['a term that is too long', `${'a'.repeat(CARD_LIMITS.term + 1)} | x`, 'termTooLong'],
    [
      'a pinyin that is too long',
      `你 | ${'a'.repeat(CARD_LIMITS.pinyin + 1)} | x`,
      'pinyinTooLong',
    ],
    [
      'a meaning that is too long',
      `x | ${'a'.repeat(CARD_LIMITS.translation + 1)}`,
      'translationTooLong',
    ],
  ])('reports %s as a line error instead of a word', (_name, line, reason) => {
    expect(parsed(`apple | pomme\n${line}`)).toEqual({
      entries: [{ lineNumber: 1, language: 'en', term: 'apple', translation: 'pomme' }],
      errors: [{ lineNumber: 2, reason }],
    });
  });

  it('reports a word repeated in the same batch, pointing to its first line', () => {
    expect(parsed('猫 | māo | chat\nCat | chat\n猫 || chat (animal)')).toEqual({
      entries: [
        { lineNumber: 1, language: 'zh', term: '猫', pinyin: 'māo', translation: 'chat' },
        { lineNumber: 2, language: 'en', term: 'Cat', translation: 'chat' },
      ],
      errors: [{ lineNumber: 3, reason: 'duplicateInBatch', firstLineNumber: 1 }],
    });
  });

  it('returns nothing for an empty input', () => {
    expect(parsed('')).toEqual({ entries: [], errors: [] });
    expect(parsed(' \n\n ')).toEqual({ entries: [], errors: [] });
  });
});

describe('parseBulkEntry limits and hostile input', () => {
  it('accepts an input exactly at the maximum length and number of words', () => {
    const lineLength = BULK_ENTRY_LIMITS.characters / BULK_ENTRY_LIMITS.lines;
    const lines = Array.from({ length: BULK_ENTRY_LIMITS.lines }, (_, index) =>
      `w${String(index)} | `.padEnd(lineLength - 1, 'x'),
    );
    const text = lines.join('\n') + '\n';

    expect(text).toHaveLength(BULK_ENTRY_LIMITS.characters);
    expect(parsed(text).entries).toHaveLength(BULK_ENTRY_LIMITS.lines);
  });

  it('rejects the whole input when it is longer than the maximum length', () => {
    const text = 'a'.repeat(BULK_ENTRY_LIMITS.characters + 1);

    expect(parseBulkEntry(text)).toEqual({ ok: false, errors: ['inputTooLong'] });
  });

  it('rejects the whole input when it has more words than allowed', () => {
    const text = Array.from(
      { length: BULK_ENTRY_LIMITS.lines + 1 },
      (_, index) => `w${String(index)}|x`,
    );

    expect(parseBulkEntry(text.join('\n'))).toEqual({ ok: false, errors: ['tooManyLines'] });
  });

  it('keeps markup as plain text: escaping is left to the display', () => {
    const entries = parsed('<img src=x onerror=alert(1)> | <script>alert(1)</script>').entries;

    expect(entries).toEqual([
      {
        lineNumber: 1,
        language: 'en',
        term: '<img src=x onerror=alert(1)>',
        translation: '<script>alert(1)</script>',
      },
    ]);
  });

  it.each([
    ['NUL characters', '\u0000 | \u0000'],
    ['a lone surrogate', '\uD800 | x'],
    ['right-to-left overrides', String.fromCodePoint(0x202e) + 'apple | pomme'],
    ['only separators', '|||||\n;;;;\n\t\t\t'],
    ['a prototype key', '__proto__ | constructor'],
  ])('never throws on %s', (_name, text) => {
    expect(() => parseBulkEntry(text)).not.toThrow();
  });
});
