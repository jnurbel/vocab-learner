import { describe, expect, it } from 'vitest';
import type { Card } from '../card';
import type { Label } from '../label';
import { planCsvImport } from './csvImportPlan';
import type { CsvEntry } from './vocabularyCsv';

const now = '2026-11-10T12:00:00.000Z';
const animals: Label = {
  id: 'l-animals',
  name: 'Animaux',
  isFocus: false,
  createdAt: now,
  updatedAt: now,
};

function entry(lineNumber: number, term: string, labelNames: string[]): CsvEntry {
  return { lineNumber, language: 'zh', term, translation: 'x', labelNames };
}

function context() {
  let sequence = 0;
  return {
    now,
    nextId: () => {
      sequence += 1;
      return `new-${String(sequence)}`;
    },
  };
}

describe('planCsvImport', () => {
  it('gives each word the labels of its row, reusing an existing label of the same name', () => {
    const { plan, newLabels } = planCsvImport(
      {
        entries: [entry(1, '猫', ['animaux', 'Leçon 3']), entry(2, '狗', ['Leçon 3'])],
        errors: [],
      },
      { existingCards: [], existingLabels: [animals], chosenLabelIds: [] },
      context(),
    );

    expect(newLabels).toEqual([
      { id: 'new-1', name: 'Leçon 3', isFocus: false, createdAt: now, updatedAt: now },
    ]);
    expect(plan.newWords.map(({ term, labelIds }) => ({ term, labelIds }))).toEqual([
      { term: '猫', labelIds: ['l-animals', 'new-1'] },
      { term: '狗', labelIds: ['new-1'] },
    ]);
  });

  it('adds the labels chosen for the whole file to every word', () => {
    const { plan } = planCsvImport(
      { entries: [entry(1, '猫', ['Animaux'])], errors: [] },
      { existingCards: [], existingLabels: [animals], chosenLabelIds: ['l-file', 'l-animals'] },
      context(),
    );

    expect(plan.newWords[0]?.labelIds).toEqual(['l-file', 'l-animals']);
  });

  it('only adds the missing labels to a word already in the list', () => {
    const cat: Card = {
      id: 'card-cat',
      language: 'zh',
      term: '猫',
      translation: 'chat',
      labelIds: ['l-animals'],
      source: 'manual',
      createdAt: now,
      updatedAt: now,
    };

    const { plan } = planCsvImport(
      {
        entries: [entry(1, '猫', ['Animaux', 'Leçon 3'])],
        errors: [{ lineNumber: 2, reason: 'missingTerm' }],
      },
      { existingCards: [cat], existingLabels: [animals], chosenLabelIds: [] },
      context(),
    );

    expect(plan).toEqual({
      newWords: [],
      existingWords: [{ lineNumber: 1, card: cat, addedLabelIds: ['new-1'] }],
      errors: [{ lineNumber: 2, reason: 'missingTerm' }],
    });
  });
});

describe('planCsvImport with an invalid label name', () => {
  it('leaves out a label name that cannot be a label, keeping the word', () => {
    const { plan, newLabels } = planCsvImport(
      { entries: [entry(1, '猫', ['   ', 'x'.repeat(61)])], errors: [] },
      { existingCards: [], existingLabels: [], chosenLabelIds: [] },
      context(),
    );

    expect(newLabels).toEqual([]);
    expect(plan.newWords[0]?.labelIds).toEqual([]);
  });
});
