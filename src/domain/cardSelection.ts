import type { Card, Language } from './card';

export interface CardSelection {
  /** Empty means every word ("Tous les mots"). */
  labelIds: readonly string[];
  language?: Language;
}

/** Words to train on: those carrying any of the labels, each word once, optionally one language. */
export function selectCards(cards: readonly Card[], selection: CardSelection): Card[] {
  const wanted = new Set(selection.labelIds);
  const isSelected = (card: Card) =>
    (selection.language === undefined || card.language === selection.language) &&
    (wanted.size === 0 || card.labelIds.some((labelId) => wanted.has(labelId)));

  const selectedById = new Map<string, Card>();
  for (const card of cards) {
    if (!selectedById.has(card.id) && isSelected(card)) {
      selectedById.set(card.id, card);
    }
  }
  return [...selectedById.values()];
}
