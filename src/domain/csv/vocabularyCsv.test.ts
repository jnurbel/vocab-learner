import { describe, expect, it } from 'vitest';
import type { Card } from '../card';
import type { Label } from '../label';
import { BYTE_ORDER_MARK, parseCsv } from './csv';
import { readVocabularyCsv, VOCABULARY_CSV_LIMITS, vocabularyToCsv } from './vocabularyCsv';

const now = '2026-11-10T12:00:00.000Z';

function card(overrides: Partial<Card> & Pick<Card, 'term'>): Card {
  return {
    id: `card-${overrides.term}`,
    language: 'zh',
    translation: 'x',
    labelIds: [],
    source: 'manual',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

const lesson: Label = { id: 'l1', name: 'Leçon 1', isFocus: false, createdAt: now, updatedAt: now };
const animals: Label = {
  id: 'l2',
  name: 'Animaux',
  isFocus: false,
  createdAt: now,
  updatedAt: now,
};

function entriesOf(text: string) {
  const read = readVocabularyCsv(text);
  if (!read.ok) {
    throw new Error(`Unexpected failure: ${read.errors.join(', ')}`);
  }
  return read.value;
}

describe('vocabularyToCsv', () => {
  it('starts with a byte order mark and a header, then one word per row', () => {
    const csv = vocabularyToCsv(
      [
        card({
          term: '猫',
          pinyin: 'māo',
          translation: 'chat',
          example: '我有猫。',
          labelIds: ['l1', 'l2'],
        }),
        card({ term: 'apple', language: 'en', translation: 'pomme' }),
      ],
      [lesson, animals],
    );

    expect(csv.startsWith(BYTE_ORDER_MARK)).toBe(true);
    expect(parseCsv(csv)).toEqual({
      ok: true,
      value: [
        ['terme', 'pinyin', 'sens', 'exemple', 'labels'],
        ['猫', 'māo', 'chat', '我有猫。', 'Leçon 1, Animaux'],
        ['apple', '', 'pomme', '', ''],
      ],
    });
  });

  it('neutralizes a cell that a spreadsheet would run as a formula', () => {
    const csv = vocabularyToCsv(
      [card({ term: 'hello', language: 'en', translation: '=HYPERLINK("http://evil","x")' })],
      [],
    );

    expect(parseCsv(csv).ok && parseCsv(csv)).toMatchObject({
      value: [expect.anything(), ['hello', '', `'=HYPERLINK("http://evil","x")`, '', '']],
    });
  });
});

describe('readVocabularyCsv', () => {
  it('reads back the words written, with their example and the names of their labels', () => {
    const words = [
      card({
        term: '猫',
        pinyin: 'māo',
        translation: 'chat; félin',
        example: 'Il dit "miaou".',
        labelIds: ['l1', 'l2'],
      }),
      card({ term: 'minus', language: 'en', translation: '-ment', labelIds: [] }),
    ];

    expect(entriesOf(vocabularyToCsv(words, [lesson, animals]))).toEqual({
      entries: [
        {
          lineNumber: 2,
          language: 'zh',
          term: '猫',
          pinyin: 'māo',
          translation: 'chat; félin',
          example: 'Il dit "miaou".',
          labelNames: ['Leçon 1', 'Animaux'],
        },
        {
          lineNumber: 3,
          language: 'en',
          term: 'minus',
          translation: '-ment',
          labelNames: [],
        },
      ],
      errors: [],
    });
  });

  it('reads a file without header, columns in the usual order', () => {
    expect(entriesOf('你好;ni3 hao3;bonjour').entries).toEqual([
      {
        lineNumber: 1,
        language: 'zh',
        term: '你好',
        pinyin: 'nǐ hǎo',
        translation: 'bonjour',
        labelNames: [],
      },
    ]);
  });

  it('checks each row as the bulk entry does, and reports problems by row', () => {
    expect(
      entriesOf('terme;pinyin;sens\napple;;\n;;poire\npear;;poire\npear;;poire').errors,
    ).toEqual([
      { lineNumber: 2, reason: 'missingTranslation' },
      { lineNumber: 3, reason: 'missingTerm' },
      { lineNumber: 5, reason: 'duplicateInBatch', firstLineNumber: 4 },
    ]);
  });

  it('reports a row with too many columns, a too long example and a too long label name', () => {
    const longExample = 'e'.repeat(1001);
    const longLabel = 'l'.repeat(61);

    expect(entriesOf(`a;;b;;;extra\nc;;d;${longExample};\ne;;f;;${longLabel}`).errors).toEqual([
      { lineNumber: 1, reason: 'tooManyColumns' },
      { lineNumber: 2, reason: 'exampleTooLong' },
      { lineNumber: 3, reason: 'labelTooLong' },
    ]);
  });

  it('removes invisible controls from the cells', () => {
    const rightToLeftOverride = String.fromCodePoint(0x202e);

    expect(entriesOf(`app${rightToLeftOverride}le;;pomme`).entries[0]?.term).toBe('apple');
  });

  it('refuses a file too large, before reading it', () => {
    expect(readVocabularyCsv('a'.repeat(VOCABULARY_CSV_LIMITS.characters + 1))).toEqual({
      ok: false,
      errors: ['inputTooLong'],
    });
  });

  it('refuses a file with too many rows', () => {
    expect(readVocabularyCsv('a;;b\n'.repeat(VOCABULARY_CSV_LIMITS.rows + 1))).toEqual({
      ok: false,
      errors: ['tooManyLines'],
    });
  });

  it('refuses a file whose quotes are broken', () => {
    expect(readVocabularyCsv('"apple;pomme')).toEqual({ ok: false, errors: ['unclosedQuote'] });
  });
});
