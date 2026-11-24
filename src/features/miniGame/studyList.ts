/** The word lists chosen for a mini-game, and the words they hold (asked by the owner, 2026-11-24). */
export interface StudyList {
  labelIds: readonly string[];
  /** The words of these lists in the language of the game: the only words it asks. */
  cardIds: readonly string[];
}
