import { failure, success, type Result } from './result';
import { checkText, type TextFieldReason } from './text';

export type Language = 'zh' | 'en';
export type CardSource = 'manual' | 'csv' | 'photo';

/** A word to learn, unique by (language, term). */
export interface Card {
  id: string;
  language: Language;
  term: string;
  pinyin?: string;
  translation: string;
  example?: string;
  labelIds: string[];
  source: CardSource;
  createdAt: string;
  updatedAt: string;
}

export interface CardDraft {
  language: Language;
  term: string;
  pinyin?: string | undefined;
  translation: string;
  example?: string | undefined;
  labelIds?: readonly string[];
  source: CardSource;
}

/** Identity and clock are injected so that the domain stays pure and testable. */
export interface CreationContext {
  id: string;
  now: string;
}

/** Maximum lengths, in Unicode code points. */
export const CARD_LIMITS = {
  term: 100,
  pinyin: 300,
  translation: 300,
  example: 1000,
} as const;

type CardTextField = keyof typeof CARD_LIMITS;

export interface CardError {
  field: CardTextField;
  reason: TextFieldReason;
}

export function createCard(draft: CardDraft, context: CreationContext): Result<Card, CardError> {
  const errors: CardError[] = [];
  const field = (name: CardTextField, raw: string | undefined, required: boolean) => {
    const checked = checkText(raw, CARD_LIMITS[name]);
    if (checked.ok) {
      return checked.value;
    }
    // A blank optional field is simply absent; any other problem is reported.
    const reported = checked.errors.filter((reason) => required || reason !== 'required');
    errors.push(...reported.map((reason) => ({ field: name, reason })));
    return undefined;
  };

  const term = field('term', draft.term, true);
  const pinyin = field('pinyin', draft.pinyin, false);
  const translation = field('translation', draft.translation, true);
  const example = field('example', draft.example, false);

  if (term === undefined || translation === undefined || errors.length > 0) {
    return failure(errors);
  }
  return success({
    id: context.id,
    language: draft.language,
    term,
    ...(pinyin === undefined ? {} : { pinyin }),
    translation,
    ...(example === undefined ? {} : { example }),
    labelIds: uniqueValues(draft.labelIds ?? []),
    source: draft.source,
    createdAt: context.now,
    updatedAt: context.now,
  });
}

function uniqueValues(values: readonly string[]): string[] {
  return [...new Set(values)];
}
