import type { Card } from '../card';
import { uniqueValues } from '../collections';
import { findCard, indexCardsByTerm, missingLabelIds, type ImportPlan } from '../importPlan';
import { createLabel, type Label } from '../label';
import { findLabelByName } from '../labelOperations';
import type { CsvEntries } from './vocabularyCsv';

export interface CsvImportTarget {
  existingCards: readonly Card[];
  existingLabels: readonly Label[];
  /** Labels chosen in the preview for every word of the file. */
  chosenLabelIds: readonly string[];
}

export interface CsvImportContext {
  nextId: () => string;
  now: string;
}

export interface CsvImportPlan {
  plan: ImportPlan;
  /** Labels named in the file that do not exist yet, to store with the words. */
  newLabels: Label[];
}

/** What a CSV import will do: each word gets the labels of its row and those chosen. */
export function planCsvImport(
  batch: CsvEntries,
  { existingCards, existingLabels, chosenLabelIds }: CsvImportTarget,
  context: CsvImportContext,
): CsvImportPlan {
  const newLabels: Label[] = [];
  const labelIdOf = (name: string): string[] => {
    const existing = findLabelByName([...existingLabels, ...newLabels], name);
    if (existing !== undefined) {
      return [existing.id];
    }
    // An id is only taken for a label really created.
    const created = createLabel(name, { id: context.nextId(), now: context.now });
    if (!created.ok) {
      return [];
    }
    newLabels.push(created.value);
    return [created.value.id];
  };

  const cardsByKey = indexCardsByTerm(existingCards);
  const plan: ImportPlan = { newWords: [], existingWords: [], errors: [...batch.errors] };
  for (const entry of batch.entries) {
    const labelIds = uniqueValues([...chosenLabelIds, ...entry.labelNames.flatMap(labelIdOf)]);
    const card = findCard(cardsByKey, entry.language, entry.term);
    if (card === undefined) {
      plan.newWords.push({ ...entry, labelIds });
    } else {
      plan.existingWords.push({
        lineNumber: entry.lineNumber,
        card,
        addedLabelIds: missingLabelIds(card, labelIds),
      });
    }
  }
  return { plan, newLabels };
}
