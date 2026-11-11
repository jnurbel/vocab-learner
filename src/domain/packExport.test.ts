import { describe, expect, it } from 'vitest';
import type { Card } from './card';
import type { Label } from './label';
import { createVocabPack, packFileName, serializeVocabPack } from './packExport';
import { parseVocabPack } from './vocabPack';

const now = '2026-11-05T12:00:00.000Z';

function label(id: string, name: string, extra: Partial<Label> = {}): Label {
  return { id, name, isFocus: false, createdAt: now, updatedAt: now, ...extra };
}

function card(id: string, term: string, labelIds: string[], extra: Partial<Card> = {}): Card {
  return {
    id,
    language: 'zh',
    term,
    translation: `meaning of ${term}`,
    labelIds,
    source: 'manual',
    createdAt: now,
    updatedAt: now,
    ...extra,
  };
}

describe('createVocabPack', () => {
  it('keeps only the words of the chosen label, with their texts and that label', () => {
    const lesson = label('lesson-7', 'Leçon 7', { color: '#c0392b' });
    const animals = label('animals', 'Animaux');
    const cat = card('c1', '猫', ['lesson-7', 'animals'], { pinyin: 'māo', example: '我的猫' });
    const dog = card('c2', '狗', ['animals']);

    expect(createVocabPack([lesson, animals], [cat, dog], ['lesson-7'])).toEqual({
      format: 'vocab-learner-pack',
      version: 1,
      labels: [{ id: 'lesson-7', name: 'Leçon 7', color: '#c0392b' }],
      cards: [
        {
          language: 'zh',
          term: '猫',
          pinyin: 'māo',
          translation: 'meaning of 猫',
          example: '我的猫',
          labelIds: ['lesson-7'],
        },
      ],
    });
  });
});

/** Every key that would reveal progress, sessions, settings or who made the pack. */
const PERSONAL_KEYS = [
  'source',
  'createdAt',
  'updatedAt',
  'isFocus',
  'examDate',
  'pastExamDate',
  'unfocusedOn',
  'due',
  'stability',
  'reps',
  'lapses',
  'lastReviewAt',
  'peakStage',
  'xp',
  'streakDays',
  'sessions',
  'settings',
  'progress',
  'profileName',
];

function keysOf(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(keysOf);
  }
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).flatMap(([key, inner]) => [key, ...keysOf(inner)]);
  }
  return [];
}

describe('createVocabPack never leaks personal data', () => {
  it('drops dates, focus, exam dates and any progress carried by the objects in memory', () => {
    const pinned = label('lesson-7', 'Leçon 7', {
      isFocus: true,
      examDate: '2026-11-20',
      pastExamDate: '2026-10-01',
      unfocusedOn: '2026-10-02',
    });
    // Objects read from storage may carry more than their type says.
    const reviewed = {
      ...card('c1', '猫', ['lesson-7']),
      due: now,
      stability: 3,
      reps: 4,
      lapses: 1,
      lastReviewAt: now,
      peakStage: 'flower',
    } as Card;

    const pack = createVocabPack([pinned], [reviewed], ['lesson-7']);
    const keys = new Set(keysOf(pack));

    expect(PERSONAL_KEYS.filter((key) => keys.has(key))).toEqual([]);
    expect(Object.keys(pack.labels[0] ?? {})).toEqual(['id', 'name']);
    expect(Object.keys(pack.cards[0] ?? {})).toEqual([
      'language',
      'term',
      'translation',
      'labelIds',
    ]);
  });

  it('is read back as a valid pack, equal to the one written', () => {
    const pack = createVocabPack(
      [label('lesson-7', 'Leçon 7'), label('animals', 'Animaux', { color: '#2e86c1' })],
      [
        card('c1', '猫', ['lesson-7', 'animals'], { pinyin: 'māo' }),
        card('c2', 'cat', ['animals']),
      ],
      ['lesson-7', 'animals'],
    );

    expect(parseVocabPack(serializeVocabPack(pack))).toEqual({ ok: true, value: pack });
  });
});

describe('createVocabPack with several labels', () => {
  it('lists a word carrying two chosen labels once, with both labels', () => {
    const pack = createVocabPack(
      [label('lesson-7', 'Leçon 7'), label('animals', 'Animaux'), label('verbs', 'Verbes')],
      [card('c1', '猫', ['verbs', 'lesson-7', 'animals'])],
      ['animals', 'lesson-7', 'ghost'],
    );

    expect(pack.labels.map(({ name }) => name)).toEqual(['Leçon 7', 'Animaux']);
    expect(pack.cards).toHaveLength(1);
    expect(pack.cards[0]?.labelIds).toEqual(['lesson-7', 'animals']);
  });
});

describe('packFileName', () => {
  it('names the file after the shared label', () => {
    expect(packFileName(['Leçon 7'])).toBe('Leçon-7.vocab.json');
  });

  it('joins the names of several labels', () => {
    expect(packFileName(['Leçon 7', 'Animaux'])).toBe('Leçon-7-Animaux.vocab.json');
  });

  it.each([
    ['a path traversal', '../../etc/passwd', 'etc-passwd.vocab.json'],
    ['a Windows path', 'C:\\Windows\\system32', 'C-Windows-system32.vocab.json'],
    ['markup', '<script>alert(1)</script>', 'script-alert-1-script.vocab.json'],
    [
      'a right-to-left override',
      `cours${String.fromCodePoint(0x202e)}nosj.exe`,
      'coursnosj-exe.vocab.json',
    ],
    ['nothing but symbols', '***', 'vocabulary.vocab.json'],
  ])('makes a safe file name out of %s', (_name, labelName, fileName) => {
    expect(packFileName([labelName])).toBe(fileName);
  });

  it('keeps Chinese label names and bounds the length', () => {
    expect(packFileName(['动物'])).toBe('动物.vocab.json');
    expect(packFileName(['x'.repeat(200)])).toBe(`${'x'.repeat(60)}.vocab.json`);
  });
});
