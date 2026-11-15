import type { Card, Language } from '../card';
import { isGapFillEligible, type BankLookup } from './gapFill';
import { isMeasureWordEligible, type MeasureWordTable } from './measureWord';
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
  'gapFill',
  'measureWord',
  'sentenceWorkshop',
] as const;

/** Games of Chinese only (GAME_DESIGN.md 6.11, 6.12): not offered in English. */
const CHINESE_ONLY: ReadonlySet<MiniGame> = new Set(['measureWord', 'sentenceWorkshop']);

export type MiniGame = (typeof MINI_GAMES)[number];

/** Why a game cannot be played yet: the words lack what it needs. */
export type ClosedReason =
  | 'fewWords'
  | 'noPinyin'
  | 'noExamples'
  | 'fewNouns'
  /** The sentence data could not be loaded (yet): offline before its first use. */
  | 'noSentenceData';

/** The sentence data of public/data/, once loaded. */
export interface CatalogSentences {
  bank: BankLookup;
  measureWords: MeasureWordTable;
}

export type MiniGameEntry =
  | { game: MiniGame; eligibleWords: number; open: true }
  | { game: MiniGame; eligibleWords: number; open: false; reason: ClosedReason };

type CatalogConfig = Pick<
  MiniGameConfig,
  'minOptions' | 'bridgeMinPairs' | 'shuffleMinChunks' | 'shuffleMaxChunks' | 'measureWordMinNouns'
>;

/**
 * Each game with the words of the language it can ask. A closed game stays listed, with the
 * reason, so that the learner knows what to add.
 */
export function miniGameCatalog(
  cards: readonly Card[],
  language: Language,
  config: CatalogConfig,
  data?: CatalogSentences,
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
  const gaps = words.filter((card) => isGapFillEligible(card, data?.bank)).length;
  const nouns =
    data === undefined
      ? 0
      : words.filter((card) => isMeasureWordEligible(card, data.measureWords)).length;
  const all: MiniGameEntry[] = [
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
    entry('gapFill', gaps, gaps === 0 ? 'noExamples' : undefined),
    entry(
      'measureWord',
      nouns,
      data === undefined
        ? 'noSentenceData'
        : nouns < config.measureWordMinNouns
          ? 'fewNouns'
          : undefined,
    ),
    entry('sentenceWorkshop', words.length, words.length === 0 ? 'fewWords' : undefined),
  ];
  return language === 'zh' ? all : all.filter(({ game }) => !CHINESE_ONLY.has(game));
}
