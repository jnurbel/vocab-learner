import type { Card, Language } from '../card';
import type { SrsConfig } from '../srs/config';
import { createRng } from '../srs/random';
import { ratingFor } from '../srs/rating';
import type { Outcome, Rating } from '../srs/reviewState';
import { isExcluded, similarity } from './distractors';
import type { Difficulty, MiniGameConfig } from './miniGameConfig';
import { shuffle } from './shuffle';

type BoardConfig = Pick<
  MiniGameConfig,
  'bridgeMinPairs' | 'similarityWeights' | 'englishHomophones' | 'optionsByLevel' | 'minOptions'
>;

/** What a bank of the bridge shows: the written word, its sound, its meaning or its pinyin. */
export interface BridgeVariant {
  left: 'term' | 'audio';
  right: 'meaning' | 'term' | 'pinyin';
  pairs: number;
}

export interface BridgeOptions {
  /** False without a voice for the language: the sound gives way to the written word. */
  voice: boolean;
}

/** The two banks of a board at a level (GAME_DESIGN.md 6.4). */
export function bridgeVariant(
  difficulty: Difficulty,
  language: Language,
  { voice }: BridgeOptions,
  config: Pick<MiniGameConfig, 'bridgePairsByLevel'>,
): BridgeVariant {
  const pairs = config.bridgePairsByLevel[difficulty];
  if (difficulty === 1) {
    return { left: 'term', right: 'meaning', pairs };
  }
  if (difficulty === 2) {
    return { left: voice ? 'audio' : 'term', right: 'meaning', pairs };
  }
  if (voice) {
    return { left: 'audio', right: 'term', pairs };
  }
  return { left: 'term', right: language === 'zh' ? 'pinyin' : 'meaning', pairs };
}

/** A board: the cards of the left bank, and the same cards in another order on the right. */
export interface BridgeBoard {
  variant: BridgeVariant;
  left: Card[];
  right: Card[];
}

export interface BoardSettings {
  seed: string;
  /** Level 3: the words closest to the first one fill the board, to be told apart. */
  close: boolean;
}

/**
 * The words of a board: the imposed words first, then the others; undefined when too few words
 * can stand together on it.
 */
export function bridgeBoard(
  targets: readonly Card[],
  others: readonly Card[],
  variant: BridgeVariant,
  { seed, close }: BoardSettings,
  config: BoardConfig,
): BridgeBoard | undefined {
  const rng = createRng(seed);
  const chosen: Card[] = [];
  const shown = (card: Card) => variant.right !== 'pinyin' || (card.pinyin ?? '').trim() !== '';
  const candidates = [...targets, ...others].filter(shown);
  const [first] = candidates;
  const ordered =
    close && first !== undefined
      ? [
          first,
          ...byProximity(first, targets.filter(shown).slice(1), config),
          ...byProximity(first, others.filter(shown), config),
        ]
      : candidates;
  for (const candidate of ordered) {
    if (chosen.length === variant.pairs) {
      break;
    }
    if (chosen.every((card) => !isExcluded(card, candidate, config))) {
      chosen.push(candidate);
    }
  }
  if (chosen.length < config.bridgeMinPairs) {
    return undefined;
  }
  return { variant, left: shuffle(chosen, rng), right: shuffle(chosen, rng) };
}

/** The cards from the closest to `first` by sound to the farthest; ties by id, for stability. */
function byProximity(first: Card, cards: readonly Card[], config: BoardConfig): Card[] {
  return cards
    .filter((card) => card !== first)
    .map((card) => ({ card, score: similarity(first, card, config) }))
    .sort((a, b) => b.score - a.score || a.card.id.localeCompare(b.card.id))
    .map(({ card }) => card);
}

export interface BridgeRound {
  /** The words to link, in the order they come on the boards. */
  targets: Card[];
  /** The other words of the language: they only fill a board that lacks words. */
  others: Card[];
}

export interface RoundOptions {
  seed: string;
  /** Imposed words, e.g. those of a step session that do not meet the step yet. */
  cardIds?: readonly string[];
}

/** The words of a round: the imposed ones, or every word, those already introduced first. */
export function bridgeRound(
  cards: readonly Card[],
  introduced: ReadonlySet<string>,
  language: Language,
  { seed, cardIds }: RoundOptions,
): BridgeRound {
  const rng = createRng(seed);
  const ofLanguage = cards.filter((card) => card.language === language);
  if (cardIds !== undefined) {
    const imposed = new Set(cardIds);
    return {
      targets: shuffle(
        ofLanguage.filter(({ id }) => imposed.has(id)),
        rng,
      ),
      others: shuffle(
        ofLanguage.filter(({ id }) => !imposed.has(id)),
        rng,
      ),
    };
  }
  const known = ofLanguage.filter(({ id }) => introduced.has(id));
  const fresh = ofLanguage.filter(({ id }) => !introduced.has(id));
  return { targets: [...shuffle(known, rng), ...shuffle(fresh, rng)], others: [] };
}

export interface PairFound {
  /** True once either card of the pair was linked to a wrong card. */
  missed: boolean;
  responseMs: number;
}

/** Each pair is one answer: right if found at the first try, rated as a choice (GAME_DESIGN.md 6.4). */
export function bridgePairResult(
  { missed, responseMs }: PairFound,
  config: Pick<SrsConfig, 'choiceSlowMs'>,
): { outcome: Outcome; rating: Rating } {
  const outcome: Outcome = missed ? 'wrong' : 'correct';
  return {
    outcome,
    rating: ratingFor(outcome, { exercise: 'choice', responseMs, hintsUsed: 0 }, config),
  };
}
