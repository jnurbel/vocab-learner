import type { Card, Language } from '../card';
import type { MiniGameConfig } from './miniGameConfig';
import { isSentenceListenEligible } from './sentenceListen';
import { shuffleSentenceOf } from './sentenceShuffle';
import { toneEchoEligibleCount } from './toneEcho';

/** The mini-games offered from the garden and the flashcards, in the order shown. */
export const MINI_GAMES = [
  'listenMeaning',
  'bridgeMatch',
  'toneEcho',
  'sentenceListen',
  'sentenceShuffle',
] as const;

export type MiniGame = (typeof MINI_GAMES)[number];

/** Why a game cannot be played yet: the words lack what it needs. */
export type ClosedReason = 'fewWords' | 'noPinyin' | 'noExamples';

export type MiniGameEntry =
  | { game: MiniGame; eligibleWords: number; open: true }
  | { game: MiniGame; eligibleWords: number; open: false; reason: ClosedReason };

type CatalogConfig = Pick<
  MiniGameConfig,
  'minOptions' | 'bridgeMinPairs' | 'shuffleMinChunks' | 'shuffleMaxChunks'
>;

/**
 * Each game with the words of the language it can ask. A closed game stays listed, with the
 * reason, so that the learner knows what to add.
 */
export function miniGameCatalog(
  cards: readonly Card[],
  language: Language,
  config: CatalogConfig,
): MiniGameEntry[] {
  const words = cards.filter((card) => card.language === language);
  const enough = words.length >= config.minOptions;
  const entry = (
    game: MiniGame,
    eligibleWords: number,
    closed: ClosedReason | undefined,
  ): MiniGameEntry =>
    closed === undefined
      ? { game, eligibleWords, open: true }
      : { game, eligibleWords, open: false, reason: closed };

  const tones = toneEchoEligibleCount(words, language);
  const sentences = words.filter(isSentenceListenEligible).length;
  const shuffles = words.filter((card) => shuffleSentenceOf(card, config) !== undefined).length;
  return [
    entry('listenMeaning', words.length, enough ? undefined : 'fewWords'),
    entry(
      'bridgeMatch',
      words.length,
      words.length >= config.bridgeMinPairs ? undefined : 'fewWords',
    ),
    // English pairs come from our own list: the game is open even without a word of the learner.
    entry('toneEcho', tones, tones > 0 || language === 'en' ? undefined : 'noPinyin'),
    entry(
      'sentenceListen',
      sentences,
      sentences === 0 ? 'noExamples' : enough ? undefined : 'fewWords',
    ),
    entry('sentenceShuffle', shuffles, shuffles === 0 ? 'noExamples' : undefined),
  ];
}
