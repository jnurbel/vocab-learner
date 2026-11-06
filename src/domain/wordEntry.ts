import { detectLanguage } from './bulkEntryParser';
import { createCard, type Card, type CardError, type CreationContext } from './card';
import { addLabels, findCard, indexCardsByTerm, missingLabelIds } from './importPlan';
import { numericToDiacritic } from './pinyin';
import { failure, success, type Result } from './result';

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

/** Builds a valid card from the form; its language follows the term. */
function cardFromFields(fields: WordFields, context: CreationContext): Result<Card, CardError> {
  const language = detectLanguage(fields.term);
  return createCard(
    {
      language,
      term: fields.term,
      // Pinyin only makes sense for Chinese; it is dropped for an English word.
      pinyin: language === 'zh' ? numericToDiacritic(fields.pinyin) : undefined,
      translation: fields.translation,
      example: fields.example,
      labelIds: fields.labelIds,
      source: 'manual',
    },
    context,
  );
}

/** Validates the one-word form and decides what saving it does. */
export function planWordEntry(
  fields: WordFields,
  existingCards: readonly Card[],
  context: CreationContext,
): Result<WordEntryOutcome, CardError> {
  const created = cardFromFields(fields, context);
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

export type WordEditError = CardError | { field: 'term'; reason: 'duplicate' };

/** Applies the edit form to a word; a new term must not be another existing word. */
export function editCard(
  card: Card,
  fields: WordFields,
  existingCards: readonly Card[],
  now: string,
): Result<Card, WordEditError> {
  const edited = cardFromFields(fields, { id: card.id, now });
  if (!edited.ok) {
    return edited;
  }
  const others = indexCardsByTerm(existingCards.filter(({ id }) => id !== card.id));
  if (findCard(others, edited.value.language, edited.value.term) !== undefined) {
    return failure([{ field: 'term', reason: 'duplicate' }]);
  }
  return success({ ...edited.value, source: card.source, createdAt: card.createdAt });
}
