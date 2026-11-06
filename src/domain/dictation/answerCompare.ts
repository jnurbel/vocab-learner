import type { Language } from '../card';
import { characterDiff, type DiffPart } from './characterDiff';

export type CompareOutcome = 'correct' | 'almost' | 'wrong';

export interface AnswerToCompare {
  language: Language;
  /** The word as stored in the vocabulary. */
  expected: string;
  /** What the learner typed, untrusted. */
  given: string;
}

export interface Comparison {
  outcome: CompareOutcome;
  diff: DiffPart[];
}

/** Full-width forms of the ASCII characters (U+FF01 to U+FF5E) sit 0xFEE0 above them. */
const FULL_WIDTH = /[！-～]/g;
const FULL_WIDTH_OFFSET = 0xfee0;
const WHITESPACE = /\s+/gu;

/** Checks a dictated word typed by the learner (GAME_DESIGN.md 6.2). */
export function compareAnswer({ expected, given }: AnswerToCompare): Promise<Comparison> {
  const wanted = normalizeChinese(expected);
  const typed = normalizeChinese(given);
  const outcome = typed === wanted ? 'correct' : 'wrong';
  return Promise.resolve({ outcome, diff: characterDiff(wanted, typed) });
}

function normalizeChinese(text: string): string {
  return (
    text
      .normalize('NFC')
      .replace(WHITESPACE, '')
      .replace(FULL_WIDTH, (char) => String.fromCharCode(char.charCodeAt(0) - FULL_WIDTH_OFFSET))
      // CJK punctuation that has no full-width form in that block.
      .replaceAll('。', '.')
      .replaceAll('、', ',')
  );
}
