import { describe, expect, it } from 'vitest';
import type { Card } from './card';
import type { Label } from './label';
import { applyPackImportPlan, planPackImport } from './packImport';
import type { VocabPack } from './vocabPack';

const before = '2026-01-01T00:00:00.000Z';

function label(id: string, name: string): Label {
  return { id, name, isFocus: false, createdAt: before, updatedAt: before };
}

function card(id: string, term: string, labelIds: string[], extra: Partial<Card> = {}): Card {
  return {
    id,
    language: 'zh',
    term,
    translation: `meaning of ${term}`,
    labelIds,
    source: 'manual',
    createdAt: before,
    updatedAt: before,
    ...extra,
  };
}

function pack(cards: VocabPack['cards'], labels: VocabPack['labels']): VocabPack {
  return { format: 'vocab-learner-pack', version: 1, labels, cards };
}

const lessonPack = pack(
  [
    { language: 'zh', term: '猫', pinyin: 'māo', translation: 'chat', labelIds: ['p-lesson'] },
    { language: 'en', term: 'dog', translation: 'chien', labelIds: ['p-lesson'] },
  ],
  [{ id: 'p-lesson', name: 'Leçon 7', color: '#c0392b' }],
);

describe('planPackImport', () => {
  it('plans every word of the pack as new, with its label to create, on an empty device', () => {
    const plan = planPackImport(lessonPack, [], []);

    expect(plan.labels).toEqual([{ name: 'Leçon 7', color: '#c0392b' }]);
    expect(plan.newWords).toEqual([
      { word: lessonPack.cards[0], labelIndexes: [0] },
      { word: lessonPack.cards[1], labelIndexes: [0] },
    ]);
    expect(plan.existingWords).toEqual([]);
  });
});

describe('planPackImport with words and labels already there', () => {
  it('reuses a label of the same name, whatever its case, instead of creating it', () => {
    const mine = label('l1', 'leçon 7');

    const plan = planPackImport(lessonPack, [], [mine]);

    expect(plan.labels).toEqual([{ name: 'Leçon 7', color: '#c0392b', existing: mine }]);
  });

  it('never duplicates a known word: it only receives the labels it lacks', () => {
    const lesson = label('l1', 'Leçon 7');
    const knownCat = card('c1', '猫', []);
    const knownDog = card('c2', 'Dog', ['l1'], { language: 'en' });

    const plan = planPackImport(lessonPack, [knownCat, knownDog], [lesson]);

    expect(plan.newWords).toEqual([]);
    expect(plan.existingWords).toEqual([
      { card: knownCat, addedLabelIndexes: [0] },
      { card: knownDog, addedLabelIndexes: [] },
    ]);
  });

  it('merges two labels of the pack that bear the same name into one', () => {
    const twins = pack(
      [
        { language: 'en', term: 'cat', translation: 'chat', labelIds: ['a'] },
        { language: 'en', term: 'dog', translation: 'chien', labelIds: ['a', 'b'] },
      ],
      [
        { id: 'a', name: 'Animaux' },
        { id: 'b', name: ' animaux ' },
      ],
    );

    const plan = planPackImport(twins, [], []);

    expect(plan.labels).toEqual([{ name: 'Animaux' }]);
    expect(plan.newWords.map(({ labelIndexes }) => labelIndexes)).toEqual([[0], [0]]);
  });
});

function ids(...values: string[]) {
  const queue = [...values];
  return () => queue.shift() ?? 'unexpected-id';
}

const now = '2026-11-10T08:00:00.000Z';

describe('applyPackImportPlan', () => {
  it('creates the new labels and words, which start without any progress', () => {
    const plan = planPackImport(lessonPack, [], []);

    const outcome = applyPackImportPlan(plan, { nextId: ids('L', 'W1', 'W2'), now });

    expect(outcome.newLabels).toEqual([
      {
        id: 'L',
        name: 'Leçon 7',
        color: '#c0392b',
        isFocus: false,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    expect(outcome.changes.cardsToCreate).toEqual([
      {
        id: 'W1',
        language: 'zh',
        term: '猫',
        pinyin: 'māo',
        translation: 'chat',
        labelIds: ['L'],
        source: 'manual',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'W2',
        language: 'en',
        term: 'dog',
        translation: 'chien',
        labelIds: ['L'],
        source: 'manual',
        createdAt: now,
        updatedAt: now,
      },
    ]);
    expect(outcome.changes.cardsToUpdate).toEqual([]);
  });

  it('keeps the example of a word', () => {
    const withExample = pack(
      [{ language: 'zh', term: '猫', translation: 'chat', example: '我的猫', labelIds: [] }],
      [],
    );

    const outcome = applyPackImportPlan(planPackImport(withExample, [], []), {
      nextId: ids('W1'),
      now,
    });

    expect(outcome.changes.cardsToCreate[0]).toMatchObject({ example: '我的猫', labelIds: [] });
  });

  it('adds the labels to the known words that lack them and leaves the others untouched', () => {
    const lesson = label('l1', 'Leçon 7');
    const knownCat = card('c1', '猫', ['other']);
    const knownDog = card('c2', 'dog', ['l1'], { language: 'en' });
    const plan = planPackImport(lessonPack, [knownCat, knownDog], [lesson]);

    const outcome = applyPackImportPlan(plan, { nextId: ids(), now });

    expect(outcome.newLabels).toEqual([]);
    expect(outcome.changes).toEqual({
      cardsToCreate: [],
      cardsToUpdate: [{ ...knownCat, labelIds: ['other', 'l1'], updatedAt: now }],
    });
  });
});

describe('packImport edge cases', () => {
  it('ignores a label a word refers to but the pack lacks, should a pack skip validation', () => {
    const broken = pack(
      [{ language: 'en', term: 'cat', translation: 'chat', labelIds: ['ghost'] }],
      [],
    );

    expect(planPackImport(broken, [], []).newWords).toEqual([
      { word: broken.cards[0], labelIndexes: [] },
    ]);
  });

  it('creates a label without colour when the pack gives none', () => {
    const plain = pack(
      [{ language: 'en', term: 'cat', translation: 'chat', labelIds: ['a'] }],
      [{ id: 'a', name: 'Animaux' }],
    );

    const outcome = applyPackImportPlan(planPackImport(plain, [], []), {
      nextId: ids('L', 'W'),
      now,
    });

    expect(outcome.newLabels).toEqual([
      { id: 'L', name: 'Animaux', isFocus: false, createdAt: now, updatedAt: now },
    ]);
  });
});
