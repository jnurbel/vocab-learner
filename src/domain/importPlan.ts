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

/** Existing words by identity, to recognise a word typed again. */
export function indexCardsByTerm(cards: readonly Card[]): Map<string, Card> {
  return new Map(cards.map((card) => [termKey(card.language, card.term), card]));
}

export function findCard(
  cardsByKey: ReadonlyMap<string, Card>,
  language: Card['language'],
  term: string,
): Card | undefined {
  return cardsByKey.get(termKey(language, term));
}

/** The chosen labels that the word does not carry yet. */
export function missingLabelIds(card: Card, labelIds: readonly string[]): string[] {
  return labelIds.filter((labelId) => !card.labelIds.includes(labelId));
}

export function addLabels(card: Card, labelIds: readonly string[], now: string): Card {
  return { ...card, labelIds: [...card.labelIds, ...labelIds], updatedAt: now };
}

export function planImport(
  batch: BulkEntries,
  existingCards: readonly Card[],
  chosenLabelIds: readonly string[],
): ImportPlan {
  const labelIds = uniqueValues(chosenLabelIds);
  const cardsByKey = indexCardsByTerm(existingCards);
  const plan: ImportPlan = { newWords: [], existingWords: [], errors: [...batch.errors] };

  for (const entry of batch.entries) {
    const card = findCard(cardsByKey, entry.language, entry.term);
    if (card === undefined) {
      plan.newWords.push({ ...entry, labelIds });
    } else {
      const addedLabelIds = missingLabelIds(card, labelIds);
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
    ({ language, term, pinyin, translation, example, labelIds }): Card => ({
      id: context.nextId(),
      language,
      term,
      ...(pinyin === undefined ? {} : { pinyin }),
      translation,
      ...(example === undefined ? {} : { example }),
      labelIds,
      source: context.source,
      createdAt: context.now,
      updatedAt: context.now,
    }),
  );
  const cardsToUpdate = plan.existingWords
    .filter(({ addedLabelIds }) => addedLabelIds.length > 0)
    .map(({ card, addedLabelIds }) => addLabels(card, addedLabelIds, context.now));
  return { cardsToCreate, cardsToUpdate };
}
