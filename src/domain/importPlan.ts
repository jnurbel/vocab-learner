import type { BulkEntries, BulkEntry, BulkLineError } from './bulkEntryParser';
import { termKey, type Card, type CardSource } from './card';
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

export interface ApplyContext {
  nextId: () => string;
  now: string;
  source: CardSource;
}

export interface ImportChanges {
  cardsToCreate: Card[];
  cardsToUpdate: Card[];
}

/** Turns a confirmed plan into the cards to save; entries were validated by the parser. */
export function applyImportPlan(plan: ImportPlan, context: ApplyContext): ImportChanges {
  const cardsToCreate = plan.newWords.map(
    ({ language, term, pinyin, translation, labelIds }): Card => ({
      id: context.nextId(),
      language,
      term,
      ...(pinyin === undefined ? {} : { pinyin }),
      translation,
      labelIds,
      source: context.source,
      createdAt: context.now,
      updatedAt: context.now,
    }),
  );
  const cardsToUpdate = plan.existingWords
    .filter(({ addedLabelIds }) => addedLabelIds.length > 0)
    .map(({ card, addedLabelIds }) => ({
      ...card,
      labelIds: [...card.labelIds, ...addedLabelIds],
      updatedAt: context.now,
    }));
  return { cardsToCreate, cardsToUpdate };
}
