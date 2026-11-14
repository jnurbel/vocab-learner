import type { Card } from '../card';
import type { CompareOutcome } from '../dictation/answerCompare';
import { pickBankSentence } from '../sentence/bankSentences';
import type { BankSentence, TranslationLanguage } from '../sentence/sentenceData';
import type { SrsConfig } from '../srs/config';
import { createRng } from '../srs/random';
import { ratingFor } from '../srs/rating';
import type { Outcome, Rating } from '../srs/reviewState';
import { difficultyFor } from './adaptiveDifficulty';
import { pickDistractors, type DistractorPool } from './distractors';
import type { AnswerDetails, QuestionSettings } from './listenMeaning';
import type { Difficulty, MiniGameConfig } from './miniGameConfig';
import { containsTerm, splitAroundTerm, type SentenceParts } from './sentenceListen';
import { shuffle } from './shuffle';

/** The bank sentences that can ask a word (see bankSentencesFor). */
export type BankLookup = (card: Card) => readonly BankSentence[];

/** A sentence with a gap where the word was (GAME_DESIGN.md 6.10). */
export interface GapSentence {
  text: string;
  parts: SentenceParts;
  /** The bank's translation, folded at first; the card's own example has none. */
  translation?: { lang: TranslationLanguage; text: string };
  /** The bank sentence, for its attribution; absent for the card's own example. */
  bank?: BankSentence;
}

export interface GapFillQuestion {
  target: Card;
  sentence: GapSentence;
  /** The written words offered, in the order shown; empty when the word is typed. */
  options: Card[];
  difficulty: Difficulty;
  mode: 'choice' | 'typed';
}

export interface GapFillResult {
  outcome: Outcome;
  rating: Rating;
}

/** Longest sentence asked (GAME_DESIGN.md 6.10): 20 characters in Chinese, 15 words in English. */
export const GAP_FILL_MAX_LENGTH: SentenceMaxLength = { zh: 20, en: 15 };

/** Characters in Chinese, words in English. */
export interface SentenceMaxLength {
  zh: number;
  en: number;
}

/** The card's own example as a sentence with a gap, when it holds the word and is short enough. */
export function exampleSentenceOf(card: Card, max: SentenceMaxLength): GapSentence | undefined {
  const text = card.example?.trim() ?? '';
  const parts = splitAroundTerm(text, card);
  const short =
    card.language === 'zh' ? Array.from(text).length <= max.zh : text.split(/\s+/).length <= max.en;
  return parts !== undefined && short ? { text, parts } : undefined;
}

/** A bank sentence of a Chinese word, drawn with the seed, with its translation and source. */
export function bankSentenceOf(
  card: Card,
  bank: BankLookup | undefined,
  seed: string,
): GapSentence | undefined {
  const picked =
    card.language !== 'zh' || bank === undefined ? undefined : pickBankSentence(bank(card), seed);
  const parts = picked === undefined ? undefined : splitAroundTerm(picked.text, card);
  return picked === undefined || parts === undefined
    ? undefined
    : {
        text: picked.text,
        parts,
        translation: { lang: picked.translation.lang, text: picked.translation.text },
        bank: picked,
      };
}

/**
 * The sentence asking `card`: its own example when it holds the word and is short enough, else
 * (Chinese only) a bank sentence whose other words are known, drawn with the seed.
 */
export function gapFillSentenceOf(
  card: Card,
  bank: BankLookup | undefined,
  seed: string,
): GapSentence | undefined {
  return exampleSentenceOf(card, GAP_FILL_MAX_LENGTH) ?? bankSentenceOf(card, bank, seed);
}

export function isGapFillEligible(card: Card, bank: BankLookup | undefined): boolean {
  return gapFillSentenceOf(card, bank, '') !== undefined;
}

/**
 * A question on `target`: written words close by sight (no tones: they are read, not heard),
 * never a word the sentence holds; typed at level 3, or when no other word can be offered.
 */
export function gapFillQuestion(
  target: Card,
  sentence: GapSentence,
  pool: DistractorPool,
  { level, stage, seed }: QuestionSettings,
  config: MiniGameConfig,
): GapFillQuestion {
  const difficulty = difficultyFor(level, stage, config);
  const typed: GapFillQuestion = { target, sentence, options: [], difficulty, mode: 'typed' };
  if (difficulty === 3) {
    return typed;
  }
  const rng = createRng(seed);
  const cards = pool.cards.filter((card) => card === target || !containsTerm(sentence.text, card));
  const byWriting = {
    ...config,
    similarityWeights: {
      ...config.similarityWeights,
      zh: { ...config.similarityWeights.zh, sameTonePattern: 0 },
    },
  };
  const distractors = pickDistractors(target, { ...pool, cards }, difficulty, rng, byWriting);
  return distractors === undefined
    ? typed
    : { ...typed, options: shuffle([target, ...distractors], rng), mode: 'choice' };
}

/** A choice is rated as in ListenMeaning: right and quick is good, a hint or slow is hard. */
export function gapFillChoiceAnswer(
  question: GapFillQuestion,
  choice: Card | 'unknown',
  { hintsUsed, responseMs }: AnswerDetails,
  config: Pick<SrsConfig, 'choiceSlowMs'>,
): GapFillResult {
  const right = choice !== 'unknown' && choice.id === question.target.id;
  const outcome: Outcome = !right ? 'wrong' : hintsUsed > 0 ? 'correctWithHint' : 'correct';
  return {
    outcome,
    rating: ratingFor(outcome, { exercise: 'choice', responseMs, hintsUsed }, config),
  };
}

/** A typed word, compared as in the dictation (GAME_DESIGN.md 6.2); time never counts. */
export function gapFillTypedOutcome(compared: CompareOutcome, hintsUsed: number): GapFillResult {
  const outcome: Outcome = compared === 'correct' && hintsUsed > 0 ? 'correctWithHint' : compared;
  return {
    outcome,
    rating: ratingFor(
      outcome,
      { exercise: 'typed', responseMs: 0, hintsUsed },
      { choiceSlowMs: 0 },
    ),
  };
}
