import { createRng } from '../srs/random';
import type { BankSentence, SentenceBank } from './sentenceData';
import { knownWordsOf } from './words';

/** The longest bank sentence asked (GAME_DESIGN.md 6.10). */
export const MAX_BANK_SENTENCE_LENGTH = 20;
/** A sentence is drawn among this many of the shortest: not always the same one. */
const SHORTEST_DRAWN = 5;

/**
 * The bank sentences that can ask `term` (GAME_DESIGN.md 6.10): they hold it, at most 20
 * characters long, and every other word is known. The word may be glued to a word at one of its
 * ends (好朋友), never sit inside a longer word (白费力气 does not hold 费力).
 */
export function bankSentencesFor(
  term: string,
  bank: SentenceBank,
  known: ReadonlySet<string>,
): BankSentence[] {
  const wanted = term.trim();
  if (wanted === '') {
    return [];
  }
  const withTerm = new Set([...known, wanted]);
  return bank.sentences.filter(
    ({ text, words }) =>
      Array.from(text).length <= MAX_BANK_SENTENCE_LENGTH &&
      text.includes(wanted) &&
      !insideAWord(words, text.indexOf(wanted), wanted.length) &&
      knownWordsOf(words, withTerm).every((word) => word.known),
  );
}

/** Whether the text from `start` sits strictly inside a single word, with letters on both sides. */
function insideAWord(words: readonly string[], start: number, length: number): boolean {
  let offset = 0;
  for (const word of words) {
    const end = offset + word.length;
    if (start > offset && start + length < end) {
      return true;
    }
    offset = end;
  }
  return false;
}

/** One of the shortest sentences, drawn with the seed: the same seed, the same sentence. */
export function pickBankSentence(
  sentences: readonly BankSentence[],
  seed: string,
): BankSentence | undefined {
  const shortest = [...sentences]
    .sort((a, b) => a.text.length - b.text.length || a.id - b.id)
    .slice(0, SHORTEST_DRAWN);
  return shortest[Math.floor(createRng(seed)() * shortest.length)];
}
