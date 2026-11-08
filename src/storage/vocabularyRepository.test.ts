// @vitest-environment node
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Card, Language } from '../domain/card';
import type { Label } from '../domain/label';
import type { ReviewStateRecord } from '../domain/progressRecords';
import { VocabularyDatabase } from './database';
import { VocabularyRepository } from './vocabularyRepository';

const now = '2026-11-05T12:00:00.000Z';

function card(id: string, term: string, labelIds: string[], language: Language = 'zh'): Card {
  return {
    id,
    language,
    term,
    translation: `meaning of ${term}`,
    labelIds,
    source: 'manual',
    createdAt: now,
    updatedAt: now,
  };
}

function label(id: string, name: string): Label {
  return { id, name, isFocus: false, createdAt: now, updatedAt: now };
}

function reviewState(cardId: string): ReviewStateRecord {
  return {
    cardId,
    due: now,
    stability: 1,
    difficulty: 5,
    reps: 1,
    lapses: 0,
    state: 'review',
    successDays: 1,
    peakStage: 'sprout',
  };
}

let repository: VocabularyRepository;
let databaseName: string;
let databaseCount = 0;

beforeEach(() => {
  databaseCount += 1;
  databaseName = `vocab-learner-test-${String(databaseCount)}`;
  repository = new VocabularyRepository(databaseName);
});

afterEach(async () => {
  await repository.deleteDatabase();
});

describe('VocabularyRepository', () => {
  it('saves the cards of an import and reads them back', async () => {
    const cat = card('c1', '猫', ['animals']);

    await repository.saveImport({ cardsToCreate: [cat], cardsToUpdate: [] });

    expect(await repository.allCards()).toEqual([cat]);
  });

  it('saves the label created during an import together with its words', async () => {
    const fruits = label('fruits', 'Fruits');
    const apple = card('c1', 'apple', ['fruits'], 'en');

    await repository.saveImport({ cardsToCreate: [apple], cardsToUpdate: [] }, fruits);

    expect(await repository.allLabels()).toEqual([fruits]);
    expect(await repository.cardsWithLabels(['fruits'])).toEqual([apple]);
  });

  it('keeps neither the label nor the words when the import fails', async () => {
    await repository.saveImport({
      cardsToCreate: [card('c1', 'apple', [], 'en')],
      cardsToUpdate: [],
    });

    await expect(
      repository.saveImport(
        { cardsToCreate: [card('c2', 'APPLE', ['fruits'], 'en')], cardsToUpdate: [] },
        label('fruits', 'Fruits'),
      ),
    ).rejects.toThrow();
    expect(await repository.allLabels()).toEqual([]);
  });

  it('updates the labels of existing words in the same import', async () => {
    const cat = card('c1', '猫', ['lesson-3']);
    await repository.saveImport({ cardsToCreate: [cat], cardsToUpdate: [] });

    const labelled = { ...cat, labelIds: ['lesson-3', 'animals'] };
    await repository.saveImport({ cardsToCreate: [], cardsToUpdate: [labelled] });

    expect(await repository.allCards()).toEqual([labelled]);
  });

  it('refuses a second word with the same language and term, and saves nothing of that import', async () => {
    await repository.saveImport({
      cardsToCreate: [card('c1', 'Apple', [], 'en')],
      cardsToUpdate: [],
    });

    await expect(
      repository.saveImport({
        cardsToCreate: [card('c2', 'pear', [], 'en'), card('c3', 'apple', [], 'en')],
        cardsToUpdate: [],
      }),
    ).rejects.toThrow();
    expect((await repository.allCards()).map(({ id }) => id)).toEqual(['c1']);
  });

  it('finds the words of several labels through the multiEntry index, once each', async () => {
    const cat = card('c1', '猫', ['lesson-3', 'animals']);
    const book = card('c2', '书', ['lesson-3']);
    const dog = card('c3', 'dog', ['animals'], 'en');
    const apple = card('c4', 'apple', ['fruits'], 'en');
    await repository.saveImport({ cardsToCreate: [cat, book, dog, apple], cardsToUpdate: [] });

    const selected = await repository.cardsWithLabels(['lesson-3', 'animals']);
    const englishOnly = await repository.cardsWithLabels(['lesson-3', 'animals'], 'en');

    expect(selected.map(({ id }) => id).sort()).toEqual(['c1', 'c2', 'c3']);
    expect(englishOnly).toEqual([dog]);
  });

  it('saves labels and reads them back', async () => {
    const lesson = label('lesson-3', 'Leçon 3');

    await repository.saveLabel(lesson);

    expect(await repository.allLabels()).toEqual([lesson]);
  });

  it('saves several labels at once, such as those unpinned after their test, and keeps the others', async () => {
    const lesson = label('lesson', 'Leçon 7');
    const animals = label('animals', 'Animaux');
    await repository.saveLabel(lesson);
    await repository.saveLabel(animals);
    const unpinned: Label = { ...lesson, pastExamDate: '2026-11-04', unfocusedOn: '2026-11-05' };

    await repository.saveLabels([unpinned]);

    expect(await repository.allLabels()).toEqual(expect.arrayContaining([unpinned, animals]));
    expect(await repository.allLabels()).toHaveLength(2);
  });

  it('applies a label deletion or merge: removed labels go, relabelled words stay', async () => {
    const lesson = label('lesson-3', 'Leçon 3');
    const animals = label('animals', 'Animaux');
    const cat = card('c1', '猫', ['lesson-3', 'animals']);
    await repository.saveLabel(lesson);
    await repository.saveLabel(animals);
    await repository.saveImport({ cardsToCreate: [cat], cardsToUpdate: [] });

    await repository.applyLabelChanges({
      labels: [lesson],
      cardsToUpdate: [{ ...cat, labelIds: ['lesson-3'] }],
    });

    expect(await repository.allLabels()).toEqual([lesson]);
    expect(await repository.allCards()).toEqual([{ ...cat, labelIds: ['lesson-3'] }]);
    expect(await repository.cardsWithLabels(['animals'])).toEqual([]);
  });

  it('drops the path progress of a removed label and keeps that of the others', async () => {
    const lesson = label('lesson-3', 'Leçon 3');
    await repository.saveLabel(lesson);
    await repository.saveLabel(label('animals', 'Animaux'));
    const database = new VocabularyDatabase(databaseName);
    await database.pathProgress.bulkAdd([
      { labelId: 'lesson-3', language: 'zh' },
      { labelId: 'animals', language: 'zh' },
      { labelId: 'animals', language: 'en' },
    ]);

    await repository.applyLabelChanges({ labels: [lesson], cardsToUpdate: [] });

    expect(await database.pathProgress.toArray()).toEqual([
      { labelId: 'lesson-3', language: 'zh' },
    ]);
    database.close();
  });

  it('carries the path of a merged label over to the label kept, in each language', async () => {
    const lesson = label('lesson-3', 'Leçon 3');
    await repository.saveLabel(lesson);
    await repository.saveLabel(label('animals', 'Animaux'));
    const database = new VocabularyDatabase(databaseName);
    await database.pathProgress.bulkAdd([
      { labelId: 'lesson-3', language: 'zh', steps: { discover: 'validated' } },
      {
        labelId: 'animals',
        language: 'zh',
        steps: { listen: 'validated' },
        finalChallengeBest: 18,
      },
      { labelId: 'animals', language: 'en', steps: { discover: 'validated' } },
    ]);

    await repository.applyLabelChanges({
      labels: [lesson],
      cardsToUpdate: [],
      merged: { sourceId: 'animals', targetId: 'lesson-3' },
    });

    expect(await database.pathProgress.toArray()).toEqual([
      { labelId: 'lesson-3', language: 'en', steps: { discover: 'validated' } },
      {
        labelId: 'lesson-3',
        language: 'zh',
        steps: { listen: 'validated', discover: 'validated' },
        finalChallengeBest: 18,
      },
    ]);
    database.close();
  });

  it('deletes a word and keeps the others', async () => {
    const cat = card('c1', '猫', []);
    const dog = card('c2', '狗', []);
    await repository.saveImport({ cardsToCreate: [cat, dog], cardsToUpdate: [] });

    await repository.deleteCard('c1');

    expect(await repository.allCards()).toEqual([dog]);
  });

  it('deletes the learning progress of a deleted word, and only of that word', async () => {
    await repository.saveImport({
      cardsToCreate: [card('c1', '猫', []), card('c2', '狗', [])],
      cardsToUpdate: [],
    });
    const database = new VocabularyDatabase(databaseName);
    await database.reviewStates.bulkAdd([reviewState('c1'), reviewState('c2')]);

    await repository.deleteCard('c1');

    expect(await database.reviewStates.toArray()).toEqual([reviewState('c2')]);
    database.close();
  });

  it('frees the former term of an edited word, so that it can be entered again', async () => {
    const cat = card('c1', '猫', []);
    await repository.saveImport({ cardsToCreate: [cat], cardsToUpdate: [] });

    await repository.saveImport({ cardsToCreate: [], cardsToUpdate: [{ ...cat, term: '小猫' }] });
    await repository.saveImport({ cardsToCreate: [card('c2', '猫', [])], cardsToUpdate: [] });

    expect((await repository.allCards()).map(({ term }) => term).sort()).toEqual(['小猫', '猫']);
  });
});
