import type { Language } from '../card';
import type { PinyinGenerator } from '../pinyinGeneration';
import { characterDiff, editDistance, type DiffPart } from './characterDiff';
import { canonicalEnglish, normalizeEnglish } from './englishAnswer';

export type CompareOutcome = 'correct' | 'almost' | 'wrong';

/** Why a wrong answer deserves a specific message. */
export type CompareReason = 'sameSoundOtherCharacter';

export interface AnswerToCompare {
  language: Language;
  /** The word as stored in the vocabulary. */
  expected: string;
  /** What the learner typed, untrusted. */
  given: string;
}

export interface CompareDependencies {
  /** pinyin-pro is large: it is loaded only to explain a wrong answer in hanzi. */
  loadPinyin: () => Promise<PinyinGenerator>;
}

export interface Comparison {
  outcome: CompareOutcome;
  diff: DiffPart[];
  reason?: CompareReason;
}

/** Full-width forms of the ASCII characters (U+FF01 to U+FF5E) sit 0xFEE0 above them. */
const FULL_WIDTH = /[！-～]/g;
const FULL_WIDTH_OFFSET = 0xfee0;
const WHITESPACE = /\s+/gu;
const LETTER = /\p{L}/gu;
/** A single typo is tolerated in words at least this long (GAME_DESIGN.md 6.2). */
const TYPO_MIN_LETTERS = 6;
const ONLY_HAN = /^\p{Script=Han}+$/u;

/** Checks a dictated word typed by the learner (GAME_DESIGN.md 6.2). */
export async function compareAnswer(
  answer: AnswerToCompare,
  dependencies: CompareDependencies,
): Promise<Comparison> {
  return answer.language === 'zh'
    ? compareChinese(answer, dependencies)
    : Promise.resolve(compareEnglish(answer));
}

function compareEnglish({ expected, given }: AnswerToCompare): Comparison {
  const wanted = normalizeEnglish(expected);
  const typed = normalizeEnglish(given);
  const canonicalWanted = canonicalEnglish(wanted);
  const canonicalTyped = canonicalEnglish(typed);
  if (canonicalTyped === canonicalWanted) {
    // An accepted spelling is right as typed, even where it differs from the stored one.
    return { outcome: 'correct', diff: characterDiff(typed, typed) };
  }
  const isTypo =
    letterCount(canonicalWanted) >= TYPO_MIN_LETTERS &&
    editDistance(canonicalWanted, canonicalTyped) === 1;
  return { outcome: isTypo ? 'almost' : 'wrong', diff: characterDiff(wanted, typed) };
}

async function compareChinese(
  { expected, given }: AnswerToCompare,
  { loadPinyin }: CompareDependencies,
): Promise<Comparison> {
  const wanted = normalizeChinese(expected);
  const typed = normalizeChinese(given);
  const diff = characterDiff(wanted, typed);
  if (typed === wanted) {
    return { outcome: 'correct', diff };
  }
  if (ONLY_HAN.test(typed) && (await soundsAlike(wanted, typed, loadPinyin))) {
    return { outcome: 'wrong', diff, reason: 'sameSoundOtherCharacter' };
  }
  return { outcome: 'wrong', diff };
}

async function soundsAlike(
  wanted: string,
  typed: string,
  loadPinyin: CompareDependencies['loadPinyin'],
): Promise<boolean> {
  const pinyin = await loadPinyin();
  const sound = (hanzi: string) =>
    pinyin(hanzi).normalize('NFC').toLowerCase().replace(WHITESPACE, '');
  return sound(typed) === sound(wanted);
}

function letterCount(text: string): number {
  return text.match(LETTER)?.length ?? 0;
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
