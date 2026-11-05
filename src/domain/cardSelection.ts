import type { Card, Language } from './card';
import { uniqueValues } from './collections';

export interface CardSelection {
  /** Empty means every word ("Tous les mots"). */
  labelIds: readonly string[];
  language?: Language;
}

/** Words to train on: those carrying any of the labels, each word once, optionally one language. */
export function selectCards(cards: readonly Card[], selection: CardSelection): Card[] {
  const wanted = new Set(selection.labelIds);
  return uniqueValues(cards).filter(
    (card) =>
      (selection.language === undefined || card.language === selection.language) &&
      (wanted.size === 0 || card.labelIds.some((labelId) => wanted.has(labelId))),
  );
}
