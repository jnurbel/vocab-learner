import type { Card } from './card';
import { uniqueValues } from './collections';
import { addLabels, findCard, indexCardsByTerm, type ImportChanges } from './importPlan';
import type { Label } from './label';
import { findLabelByName, labelNameKey } from './labelOperations';
import type { VocabPack } from './vocabPack';

export type PackWord = VocabPack['cards'][number];

/** A label of the pack: an existing label of the same name, or one to create. */
export interface PlannedPackLabel {
  name: string;
  color?: string;
  existing?: Label;
}

/** What importing a pack will do, shown in the preview before anything is saved. */
export interface PackImportPlan {
  /** One per distinct label name, in the order of the pack. */
  labels: PlannedPackLabel[];
  newWords: { word: PackWord; labelIndexes: number[] }[];
  /** Known words are never duplicated: they only receive the labels they lack. */
  existingWords: { card: Card; addedLabelIndexes: number[] }[];
}

/**
 * Plans the import of a validated pack (DESIGN §8.3): its labels are matched by name with the
 * learner's, and its words by (language, term) with the learner's words.
 */
export function planPackImport(
  pack: VocabPack,
  existingCards: readonly Card[],
  existingLabels: readonly Label[],
): PackImportPlan {
  const { labels, indexOfPackId } = planLabels(pack.labels, existingLabels);
  const cardsByKey = indexCardsByTerm(existingCards);
  const plan: PackImportPlan = { labels, newWords: [], existingWords: [] };
  for (const word of pack.cards) {
    const labelIndexes = uniqueValues(word.labelIds.flatMap((id) => indexOfPackId.get(id) ?? []));
    const card = findCard(cardsByKey, word.language, word.term);
    if (card === undefined) {
      plan.newWords.push({ word, labelIndexes });
    } else {
      const addedLabelIndexes = labelIndexes.filter((index) => {
        const existing = labels[index]?.existing;
        return existing === undefined || !card.labelIds.includes(existing.id);
      });
      plan.existingWords.push({ card, addedLabelIndexes });
    }
  }
  return plan;
}

/** Labels of the pack bearing the same name become one, and reuse the learner's of that name. */
function planLabels(packLabels: VocabPack['labels'], existingLabels: readonly Label[]) {
  const labels: PlannedPackLabel[] = [];
  const indexByName = new Map<string, number>();
  const indexOfPackId = new Map<string, number>();
  for (const { id, name, color } of packLabels) {
    const key = labelNameKey(name);
    let index = indexByName.get(key);
    if (index === undefined) {
      index = labels.length;
      indexByName.set(key, index);
      const existing = findLabelByName(existingLabels, name);
      labels.push({
        name,
        ...(color === undefined ? {} : { color }),
        ...(existing === undefined ? {} : { existing }),
      });
    }
    indexOfPackId.set(id, index);
  }
  return { labels, indexOfPackId };
}

export interface PackImportContext {
  nextId: () => string;
  now: string;
}

export interface PackImportOutcome {
  newLabels: Label[];
  changes: ImportChanges;
}

/**
 * Turns a confirmed plan into what to save. Every word gets a fresh identity and no progress:
 * the pack carries none, and the learner starts the words from scratch.
 */
export function applyPackImportPlan(
  plan: PackImportPlan,
  { nextId, now }: PackImportContext,
): PackImportOutcome {
  const newLabels: Label[] = [];
  const labelIds = plan.labels.map(({ name, color, existing }) => {
    if (existing !== undefined) {
      return existing.id;
    }
    const created: Label = {
      id: nextId(),
      name,
      ...(color === undefined ? {} : { color }),
      isFocus: false,
      createdAt: now,
      updatedAt: now,
    };
    newLabels.push(created);
    return created.id;
  });
  const idsOf = (indexes: readonly number[]) =>
    labelIds.filter((_id, index) => indexes.includes(index));

  const cardsToCreate = plan.newWords.map(
    ({ word: { language, term, pinyin, translation, example }, labelIndexes }): Card => ({
      id: nextId(),
      language,
      term,
      ...(pinyin === undefined ? {} : { pinyin }),
      translation,
      ...(example === undefined ? {} : { example }),
      labelIds: idsOf(labelIndexes),
      source: 'manual',
      createdAt: now,
      updatedAt: now,
    }),
  );
  const cardsToUpdate = plan.existingWords
    .filter(({ addedLabelIndexes }) => addedLabelIndexes.length > 0)
    .map(({ card, addedLabelIndexes }) => addLabels(card, idsOf(addedLabelIndexes), now));
  return { newLabels, changes: { cardsToCreate, cardsToUpdate } };
}
