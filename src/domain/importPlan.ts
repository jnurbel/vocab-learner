import type { BulkEntries, BulkEntry, BulkLineError } from './bulkEntryParser';
import { termKey, type Card } from './card';
import { uniqueValues } from './collections';

export interface PlannedNewWord extends BulkEntry {
  labelIds: string[];
}

/** A word already in the list: it is not duplicated, it only receives the labels it lacks. */
export interface PlannedExistingWord {
  lineNumber: number;
  card: Card;
  addedLabelIds: string[];
}

/** What an import will do, shown in the preview before anything is saved. */
export interface ImportPlan {
  newWords: PlannedNewWord[];
  existingWords: PlannedExistingWord[];
  errors: BulkLineError[];
}

export function planImport(
  batch: BulkEntries,
  existingCards: readonly Card[],
  chosenLabelIds: readonly string[],
): ImportPlan {
  const labelIds = uniqueValues(chosenLabelIds);
  const cardsByKey = new Map(
    existingCards.map((card) => [termKey(card.language, card.term), card]),
  );
  const plan: ImportPlan = { newWords: [], existingWords: [], errors: [...batch.errors] };

  for (const entry of batch.entries) {
    const card = cardsByKey.get(termKey(entry.language, entry.term));
    if (card === undefined) {
      plan.newWords.push({ ...entry, labelIds });
    } else {
      const addedLabelIds = labelIds.filter((labelId) => !card.labelIds.includes(labelId));
      plan.existingWords.push({ lineNumber: entry.lineNumber, card, addedLabelIds });
    }
  }
  return plan;
}
