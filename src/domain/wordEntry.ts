import { detectLanguage } from './bulkEntryParser';
import { createCard, type Card, type CardError, type CreationContext } from './card';
import { addLabels, findCard, indexCardsByTerm, missingLabelIds } from './importPlan';
import { numericToDiacritic } from './pinyin';
import { success, type Result } from './result';

/** What the learner types in the one-word form, as raw text. */
export interface WordFields {
  term: string;
  pinyin: string;
  translation: string;
  example: string;
  labelIds: readonly string[];
}

export type WordEntryOutcome =
  | { kind: 'created'; card: Card }
  /** The word already exists: it is not duplicated, it only receives the labels it lacked. */
  | { kind: 'labelsAdded'; card: Card; addedLabelIds: string[] }
  | { kind: 'alreadyPresent'; card: Card };

/** Validates the one-word form and decides what saving it does. */
export function planWordEntry(
  fields: WordFields,
  existingCards: readonly Card[],
  context: CreationContext,
): Result<WordEntryOutcome, CardError> {
  const created = createCard(
    {
      language: detectLanguage(fields.term),
      term: fields.term,
      pinyin: numericToDiacritic(fields.pinyin),
      translation: fields.translation,
      example: fields.example,
      labelIds: fields.labelIds,
      source: 'manual',
    },
    context,
  );
  if (!created.ok) {
    return created;
  }
  const candidate = created.value;
  const existing = findCard(indexCardsByTerm(existingCards), candidate.language, candidate.term);
  if (existing === undefined) {
    return success({ kind: 'created', card: candidate });
  }
  const addedLabelIds = missingLabelIds(existing, candidate.labelIds);
  return success(
    addedLabelIds.length === 0
      ? { kind: 'alreadyPresent', card: existing }
      : {
          kind: 'labelsAdded',
          card: addLabels(existing, addedLabelIds, context.now),
          addedLabelIds,
        },
  );
}
