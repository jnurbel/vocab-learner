import { detectLanguage } from './bulkEntryParser';
import { createCard, type Card, type CardError, type CreationContext } from './card';
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

export type WordEntryOutcome = { kind: 'created'; card: Card };

/** Validates the one-word form and decides what saving it does. */
export function planWordEntry(
  fields: WordFields,
  _existingCards: readonly Card[],
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
  return success({ kind: 'created', card: created.value });
}
