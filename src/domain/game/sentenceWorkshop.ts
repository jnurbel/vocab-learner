import type { Card } from '../card';
import { cleanAnswer } from '../dictation/answerText';
import {
  findFrequentErrors,
  type FoundError,
  type RuleResources,
} from '../sentence/frequentErrors';
import { knownWordsOf, segmentChinese } from '../sentence/words';
import {
  bankSentenceOf,
  exampleSentenceOf,
  type BankLookup,
  type GapSentence,
  type SentenceMaxLength,
} from './gapFill';

/** A learner's sentence: 4 to 40 characters (GAME_DESIGN.md 6.12). */
export const WORKSHOP_LENGTH = { min: 4, max: 40 } as const;
/** A model sentence is read, not heard: as long as a SentenceListen one (GAME_DESIGN.md 6.5). */
const WORKSHOP_MODEL_MAX_LENGTH: SentenceMaxLength = { zh: 40, en: 25 };

export interface WorkshopResources {
  rules: RuleResources;
  /** HSK 1 to 3 and the learner's words (createKnownWords). */
  known: ReadonlySet<string>;
}

/**
 * What the app can check of a sentence (GAME_DESIGN.md 6.12): never whether it is right. A
 * sentence without anything to report is only "without frequent error".
 */
export interface WorkshopCheck {
  /** The sentence as checked: hidden controls removed, length bounded. */
  sentence: string;
  containsWord: boolean;
  length: 'ok' | 'tooShort' | 'tooLong';
  /** Characters that are neither hanzi, digits, punctuation nor spaces. */
  foreignCharacters: string[];
  /** Frequent errors found. */
  errors: FoundError[];
  /** Rules that may be wrong: told as a question, never as a mistake. */
  toCheck: FoundError[];
  /** Words outside HSK 1-3 and the learner's list, for information only. */
  unknownWords: string[];
}

const ALLOWED = /[\p{Script=Han}\p{N}\p{P}\s]/u;
const HAN = /\p{Script=Han}/u;

export function checkWorkshopSentence(
  given: string,
  card: Card,
  { rules, known }: WorkshopResources,
): WorkshopCheck {
  const sentence = cleanAnswer(given).trim();
  const length = Array.from(sentence.replace(/\s/gu, '')).length;
  const found = findFrequentErrors(sentence, rules);
  const words = knownWordsOf(segmentChinese(sentence), new Set([...known, card.term.trim()]));
  return {
    sentence,
    containsWord: card.term.trim() !== '' && sentence.includes(card.term.trim()),
    length:
      length < WORKSHOP_LENGTH.min ? 'tooShort' : length > WORKSHOP_LENGTH.max ? 'tooLong' : 'ok',
    foreignCharacters: [...new Set(Array.from(sentence).filter((char) => !ALLOWED.test(char)))],
    errors: found.filter(({ level }) => level === 'error'),
    toCheck: found.filter(({ level }) => level === 'toCheck'),
    unknownWords: [
      ...new Set(
        words.filter((word) => !word.known && HAN.test(word.word)).map(({ word }) => word),
      ),
    ],
  };
}

/** Whether a check found something wrong; a rule "to check" never counts. */
export function hasDetectedError(check: WorkshopCheck): boolean {
  return (
    !check.containsWord ||
    check.length !== 'ok' ||
    check.foreignCharacters.length > 0 ||
    check.errors.length > 0
  );
}

/** "Garder comme exemple du mot": for a word without example, a sentence without error found. */
export function canKeepAsExample(card: Card, check: WorkshopCheck): boolean {
  return (card.example ?? '').trim() === '' && !hasDetectedError(check);
}

/** The model shown after the check: the word's own example, else a bank sentence. */
export function workshopModelSentence(
  card: Card,
  bank: BankLookup | undefined,
  seed: string,
): GapSentence | undefined {
  return exampleSentenceOf(card, WORKSHOP_MODEL_MAX_LENGTH) ?? bankSentenceOf(card, bank, seed);
}
