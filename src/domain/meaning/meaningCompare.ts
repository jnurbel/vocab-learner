import { cleanAnswer } from '../dictation/answerText';
import { editDistance } from '../dictation/characterDiff';
import { isSenseSeparator } from './senses';

export type MeaningOutcome = 'correct' | 'almost' | 'wrong';

export interface MeaningComparison {
  outcome: MeaningOutcome;
  /** The stored sense the answer was recognised as, to show it. */
  sense?: string;
}

/** A single typo is tolerated in senses at least this long, as in a dictation (GAME_DESIGN 6.2). */
const TYPO_MIN_LETTERS = 6;
const LETTER = /\p{L}/gu;
/** The word "ou" joins two senses, unless it is between parentheses. */
const OR_WORD = /\s+ou\s+(?![^(]*\))/iu;
const COMBINING_MARKS = /\p{M}/gu;
/** Right and left single quotes, modifier apostrophe, backtick, acute accent, prime. */
const APOSTROPHES = /[’‘ʼ`´′]/g;
/** A comment between parentheses, or one left open until the end. */
const PARENTHESES = /\([^()]*\)|\(.*$/g;
const NOT_WORD = /[^\p{L}\p{N}'\s]/gu;
const WHITESPACE = /\s+/gu;
/** An article takes a space after it, unless it is elided ("l'eau"). */
const LEADING_ARTICLE = /^(?:(?:les|le|la|une|un|des|du|de la)\s+|(?:de l'|l'|d'))/;
/** The reflexive pronoun is optional: "se laver" and "laver" are the same answer. */
const REFLEXIVE_PRONOUN = /^(?:se\s+|s')/;

/**
 * Checks the French meaning typed by the learner against the stored translation. One sense is
 * enough; case, accents, leading articles, comments between parentheses, punctuation and the
 * reflexive pronoun do not count (the `glosses` of GAME_DESIGN.md 6.0).
 */
export function compareMeaning(answer: string, translation: string): MeaningComparison {
  const typed = normalizeMeaning(answer);
  if (typed === '') {
    return { outcome: 'wrong' };
  }
  const senses = splitSenses(translation).map((sense) => ({
    sense,
    normalized: normalizeMeaning(sense),
  }));
  const exact = senses.find(({ normalized }) => normalized === typed);
  if (exact !== undefined) {
    return { outcome: 'correct', sense: exact.sense };
  }
  const near = senses.find(({ normalized }) => isTypo(normalized, typed));
  return near === undefined ? { outcome: 'wrong' } : { outcome: 'almost', sense: near.sense };
}

function isTypo(sense: string, typed: string): boolean {
  return letterCount(sense) >= TYPO_MIN_LETTERS && editDistance(sense, typed) === 1;
}

function letterCount(text: string): number {
  return text.match(LETTER)?.length ?? 0;
}

/** The senses of a translation, as written; a separator between parentheses splits nothing. */
function splitSenses(translation: string): string[] {
  const senses: string[] = [];
  let depth = 0;
  let sense = '';
  for (const char of translation) {
    if (char === '(') {
      depth += 1;
    } else if (char === ')') {
      depth = Math.max(depth - 1, 0);
    }
    if (depth === 0 && isSenseSeparator(char)) {
      senses.push(sense);
      sense = '';
    } else {
      sense += char;
    }
  }
  senses.push(sense);
  return senses.flatMap((part) => part.split(OR_WORD)).map((part) => part.trim());
}

/** The form two spellings of the same French meaning share; untrusted text is bounded first. */
function normalizeMeaning(text: string): string {
  return cleanAnswer(text)
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(APOSTROPHES, "'")
    .replace(PARENTHESES, ' ')
    .replace(NOT_WORD, ' ')
    .replace(WHITESPACE, ' ')
    .trim()
    .replace(LEADING_ARTICLE, '')
    .replace(REFLEXIVE_PRONOUN, '');
}
