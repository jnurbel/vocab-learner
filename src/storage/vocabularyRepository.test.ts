// @vitest-environment node
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Card, Language } from '../domain/card';
import type { Label } from '../domain/label';
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

let repository: VocabularyRepository;
let databaseCount = 0;

beforeEach(() => {
  databaseCount += 1;
  repository = new VocabularyRepository(`vocab-learner-test-${String(databaseCount)}`);
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
});
