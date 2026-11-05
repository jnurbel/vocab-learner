import { describe, expect, it } from 'vitest';
import { parseVocabPack } from './vocabPack';

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
