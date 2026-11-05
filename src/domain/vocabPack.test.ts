import { describe, expect, it } from 'vitest';
import { CARD_LIMITS } from './card';
import { PACK_LIMITS, parseVocabPack } from './vocabPack';

function validPack() {
  return {
    format: 'vocab-learner-pack',
    version: 1,
    labels: [{ id: 'lesson-7', name: ' Leçon 7 ', color: '#c0392b' }],
    cards: [
      {
        language: 'zh',
        term: ' 你好 ',
        pinyin: 'nǐ hǎo',
        translation: 'bonjour',
        example: '你好吗？',
        labelIds: ['lesson-7'],
      },
      { language: 'en', term: 'apple', translation: 'pomme', labelIds: [] },
    ],
  };
}

describe('parseVocabPack', () => {
  it('reads a valid pack and trims its texts', () => {
    expect(parseVocabPack(JSON.stringify(validPack()))).toEqual({
      ok: true,
      value: {
        format: 'vocab-learner-pack',
        version: 1,
        labels: [{ id: 'lesson-7', name: 'Leçon 7', color: '#c0392b' }],
        cards: [
          {
            language: 'zh',
            term: '你好',
            pinyin: 'nǐ hǎo',
            translation: 'bonjour',
            example: '你好吗？',
            labelIds: ['lesson-7'],
          },
          { language: 'en', term: 'apple', translation: 'pomme', labelIds: [] },
        ],
      },
    });
  });
});

function issuesOf(input: unknown) {
  const result = parseVocabPack(typeof input === 'string' ? input : JSON.stringify(input));
  return result.ok ? [] : result.errors;
}

describe('parseVocabPack rejects malformed files', () => {
  it.each(['', 'not json', '{"format":', 'null', '42', '[]'])(
    'reports a file that is not a pack object: %j',
    (text) => {
      expect(parseVocabPack(text).ok).toBe(false);
    },
  );

  it('reports invalid JSON without throwing', () => {
    expect(parseVocabPack('{oops')).toEqual({
      ok: false,
      errors: [{ path: '', code: 'invalidJson' }],
    });
  });

  it('reports an unknown format or version', () => {
    expect(issuesOf({ ...validPack(), format: 'other' })).toContainEqual(
      expect.objectContaining({ path: 'format' }),
    );
    expect(issuesOf({ ...validPack(), version: 2 })).toContainEqual(
      expect.objectContaining({ path: 'version' }),
    );
  });

  it('points to the field of the word that is wrong', () => {
    const pack = validPack();
    const issues = issuesOf({
      ...pack,
      cards: [
        { ...pack.cards[1], language: 'fr' },
        { ...pack.cards[1], translation: '   ' },
      ],
    });

    expect(issues).toEqual([
      expect.objectContaining({ path: 'cards.0.language' }),
      expect.objectContaining({ path: 'cards.1.translation' }),
    ]);
  });

  it('rejects unexpected keys, including prototype pollution attempts', () => {
    const polluted = JSON.stringify(validPack()).replace(
      '"format"',
      '"__proto__":{"isAdmin":true},"format"',
    );

    expect(issuesOf(polluted)).toEqual([{ path: '', code: 'unrecognized_keys' }]);
    expect(issuesOf({ ...validPack(), progress: { xp: 1000 } })).toEqual([
      { path: '', code: 'unrecognized_keys' },
    ]);
    expect(({} as Record<string, unknown>)['isAdmin']).toBeUndefined();
  });
});

function withCard(card: Record<string, unknown>) {
  return { ...validPack(), cards: [{ ...validPack().cards[1], ...card }] };
}

function withLabel(label: Record<string, unknown>) {
  return { ...validPack(), labels: [{ ...validPack().labels[0], ...label }] };
}

describe('parseVocabPack limits', () => {
  it('rejects a file larger than the maximum size before parsing it', () => {
    const text = ' '.repeat(PACK_LIMITS.characters + 1);

    expect(parseVocabPack(text)).toEqual({
      ok: false,
      errors: [{ path: '', code: 'fileTooLarge' }],
    });
  });

  it('rejects too many words, labels, or labels on one word', () => {
    const card = validPack().cards[1];
    const tooManyCards = Array.from({ length: PACK_LIMITS.cards + 1 }, (_, index) => ({
      ...card,
      term: `w${String(index)}`,
    }));
    const tooManyLabels = Array.from({ length: PACK_LIMITS.labels + 1 }, (_, index) => ({
      id: `l${String(index)}`,
      name: `L${String(index)}`,
    }));
    const tooManyLabelIds = Array.from({ length: PACK_LIMITS.labelsPerCard + 1 }, () => 'lesson-7');

    expect(issuesOf({ ...validPack(), cards: tooManyCards })).toEqual([
      { path: 'cards', code: 'too_big' },
    ]);
    expect(issuesOf({ ...validPack(), labels: tooManyLabels })).toEqual([
      { path: 'labels', code: 'too_big' },
    ]);
    expect(issuesOf(withCard({ labelIds: tooManyLabelIds }))).toEqual([
      { path: 'cards.0.labelIds', code: 'too_big' },
    ]);
  });

  it('measures text length in characters, so rare hanzi outside the BMP are not penalised', () => {
    const rareHanzi = String.fromCodePoint(0x20000);

    expect(
      issuesOf(withCard({ language: 'zh', term: rareHanzi.repeat(CARD_LIMITS.term) })),
    ).toEqual([]);
    expect(
      issuesOf(withCard({ language: 'zh', term: rareHanzi.repeat(CARD_LIMITS.term + 1) })),
    ).toEqual([{ path: 'cards.0.term', code: 'too_big' }]);
  });
});

describe('parseVocabPack hostile content', () => {
  it('keeps markup as plain text, to be escaped when displayed', () => {
    const result = parseVocabPack(
      JSON.stringify(withCard({ term: '<img src=x onerror=alert(1)>', translation: '<b>x</b>' })),
    );

    expect(result.ok && result.value.cards[0]).toMatchObject({
      term: '<img src=x onerror=alert(1)>',
      translation: '<b>x</b>',
    });
  });

  it.each([
    ['a NUL character', String.fromCodePoint(0)],
    ['an escape character', String.fromCodePoint(0x1b)],
    ['a right-to-left override', String.fromCodePoint(0x202e)],
    ['a bidi isolate', String.fromCodePoint(0x2066)],
  ])('rejects texts containing %s', (_name, character) => {
    expect(issuesOf(withCard({ translation: `pom${character}me` }))).toEqual([
      { path: 'cards.0.translation', code: 'custom' },
    ]);
    expect(issuesOf(withLabel({ name: `L${character}` }))).toEqual([
      { path: 'labels.0.name', code: 'custom' },
    ]);
  });

  it('allows line breaks only in examples', () => {
    expect(issuesOf(withCard({ example: 'line one\nline two' }))).toEqual([]);
    expect(issuesOf(withCard({ term: 'a\nb' }))).toEqual([
      { path: 'cards.0.term', code: 'custom' },
    ]);
  });

  it.each(['red', '#fff; background:url(https://evil.example)', 'url(x)', '#12345g'])(
    'rejects a label color that is not a six-digit hex code: %s',
    (color) => {
      expect(issuesOf(withLabel({ color }))).toEqual([
        { path: 'labels.0.color', code: 'invalid_format' },
      ]);
    },
  );

  it.each(['', '../etc/passwd', 'a b', '<script>', 'x'.repeat(65)])(
    'rejects a label id that is not a short safe token: %j',
    (id) => {
      expect(issuesOf(withLabel({ id }))).toContainEqual(
        expect.objectContaining({ path: 'labels.0.id' }),
      );
    },
  );

  it('never throws on deeply nested JSON', () => {
    const depth = 50_000;
    const text = '['.repeat(depth) + ']'.repeat(depth);

    expect(() => parseVocabPack(text)).not.toThrow();
    expect(parseVocabPack(text).ok).toBe(false);
  });
});

describe('parseVocabPack consistency', () => {
  it('reports a word that refers to a label missing from the pack', () => {
    expect(issuesOf(withCard({ labelIds: ['lesson-7', 'ghost'] }))).toEqual([
      { path: 'cards.0.labelIds.1', code: 'unknownLabel' },
    ]);
  });

  it('reports two labels sharing the same id', () => {
    const pack = validPack();
    const labels = [...pack.labels, { id: 'lesson-7', name: 'Autre' }];

    expect(issuesOf({ ...pack, labels })).toEqual([
      { path: 'labels.1.id', code: 'duplicateLabel' },
    ]);
  });

  it('reports a word present twice in the same language', () => {
    const pack = validPack();
    const cards = [
      ...pack.cards,
      { language: 'en', term: 'Apple', translation: 'x', labelIds: [] },
    ];

    expect(issuesOf({ ...pack, cards })).toEqual([{ path: 'cards.2.term', code: 'duplicateWord' }]);
  });
});
