import type { Card } from './card';
import { safeFileNamePart } from './fileName';
import type { Label } from './label';
import type { VocabPack } from './vocabPack';

type PackCard = VocabPack['cards'][number];
type PackLabel = VocabPack['labels'][number];

/**
 * Builds a shareable pack from the chosen labels (DESIGN §8.3): the words carrying any of them,
 * with their texts and those labels only. Fields are copied one by one, so that no progress,
 * date or personal data can ever slip in.
 */
export function createVocabPack(
  labels: readonly Label[],
  cards: readonly Card[],
  chosenLabelIds: readonly string[],
): VocabPack {
  const chosen = new Set(chosenLabelIds);
  const packLabels = labels.filter(({ id }) => chosen.has(id)).map(toPackLabel);
  const packCards = cards
    .filter((card) => card.labelIds.some((labelId) => chosen.has(labelId)))
    .map((card) => toPackCard(card, chosen));
  return { format: 'vocab-learner-pack', version: 1, labels: packLabels, cards: packCards };
}

function toPackLabel({ id, name, color }: Label): PackLabel {
  return { id, name, ...(color === undefined ? {} : { color }) };
}

function toPackCard(card: Card, chosen: ReadonlySet<string>): PackCard {
  const { language, term, pinyin, translation, example } = card;
  return {
    language,
    term,
    ...(pinyin === undefined ? {} : { pinyin }),
    translation,
    ...(example === undefined ? {} : { example }),
    labelIds: card.labelIds.filter((labelId) => chosen.has(labelId)),
  };
}

/** The text of the `.vocab.json` file: indented, so that a teacher can read it. */
export function serializeVocabPack(pack: VocabPack): string {
  return JSON.stringify(pack, null, 2);
}

/** Longest name part of a pack file, in code points. */
const PACK_NAME_MAX_LENGTH = 60;
const FALLBACK_PACK_NAME = 'vocabulary';

/** `<label names>.vocab.json`, safe to offer as a download whatever the names typed. */
export function packFileName(labelNames: readonly string[]): string {
  const name = safeFileNamePart(labelNames.join(' '), PACK_NAME_MAX_LENGTH, FALLBACK_PACK_NAME);
  return `${name}.vocab.json`;
}
