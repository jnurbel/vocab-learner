import { CARD_LIMITS, termKey, type Language } from '../card';
import { failure, success, type Result } from '../result';
import { removeInvisibleControls } from '../safeText';
import { codePointLength } from '../text';
import { baseFormCandidates } from './englishForms';
import {
  adjustRun,
  type FoundWord,
  type SegmentAdjustment,
  type WordRun,
} from './segmentAdjustments';

/** A word found in a pasted text, proposed for the learner's list. */
export interface TextWord {
  language: Language;
  term: string;
  /** How many times the word appears in the text. */
  occurrences: number;
  /** Other forms of the word met in the text and counted with it (cats, played). */
  forms: string[];
  /** The word right after its first appearance, in the same sentence: to join them if need be. */
  followedBy?: string;
  /** The sentence where the word first appears, the example of its card; absent when too long. */
  sentence?: string;
}

export type TextInputError = 'inputTooLong';

/** Bounds on an untrusted pasted text, checked before any work. */
export const TEXT_IMPORT_LIMITS = {
  characters: 20_000,
} as const;

const sentenceSegmenter = new Intl.Segmenter('zh', { granularity: 'sentence' });
const wordSegmenter = new Intl.Segmenter('zh', { granularity: 'word' });

const CHINESE_WORD = /^\p{Script=Han}+$/u;
/** Latin letters, with inner apostrophes or hyphens (don't, well-known). */
const ENGLISH_WORD = /^\p{Script=Latin}+(?:['-]\p{Script=Latin}+)*$/u;
const TYPOGRAPHIC_APOSTROPHE = /[’ʼ]/g;
const STARTS_UPPER_CASE = /^\p{Lu}/u;

/** A word being collected, with what tells a proper noun apart. */
interface Collected {
  word: TextWord;
  seenInLowerCase: boolean;
  capitalizedInsideSentence: boolean;
}

/** The word as it would be stored, or undefined for punctuation, numbers and other scripts. */
function toWord(segment: string): FoundWord | undefined {
  if (CHINESE_WORD.test(segment)) {
    return { language: 'zh', term: segment, capitalized: false };
  }
  const english = segment.replace(TYPOGRAPHIC_APOSTROPHE, "'");
  if (ENGLISH_WORD.test(english)) {
    return {
      language: 'en',
      term: english.toLowerCase(),
      capitalized: STARTS_UPPER_CASE.test(english),
    };
  }
  return undefined;
}

/** The runs of words of a sentence: punctuation, numbers and other scripts break a run. */
function runsOfSentence(sentence: string): WordRun[] {
  const runs: WordRun[] = [[]];
  for (const { segment, isWordLike } of wordSegmenter.segment(sentence)) {
    const word = isWordLike === true ? toWord(segment) : undefined;
    if (word !== undefined) {
      runs[runs.length - 1]?.push(word);
    } else if (segment.trim() !== '') {
      runs.push([]);
    }
  }
  return runs;
}

function asExample(sentence: string): string | undefined {
  return codePointLength(sentence) <= CARD_LIMITS.example ? sentence : undefined;
}

/** Capitalized inside a sentence and never written in lower case: Tom, Paris, NASA. */
function isObviousProperNoun({ word, seenInLowerCase, capitalizedInsideSentence }: Collected) {
  return word.language === 'en' && capitalizedInsideSentence && !seenInLowerCase;
}

/** Starts counting a word at its first appearance, where its example and next word are read. */
function startCollecting(
  collected: Map<string, Collected>,
  { language, term }: FoundWord,
  context: { sentence: string; followedBy: string | undefined },
): Collected {
  const example = asExample(context.sentence);
  const entry: Collected = {
    word: {
      language,
      term,
      occurrences: 0,
      forms: [],
      ...(context.followedBy === undefined ? {} : { followedBy: context.followedBy }),
      ...(example === undefined ? {} : { sentence: example }),
    },
    seenInLowerCase: false,
    capitalizedInsideSentence: false,
  };
  collected.set(termKey(language, term), entry);
  return entry;
}

/**
 * Extracts the words of a text, each once, in order of first appearance. The text is plain text:
 * nothing in it is interpreted, and its invisible controls are dropped.
 */
export function extractTextWords(
  text: string,
  adjustments: readonly SegmentAdjustment[] = [],
): Result<TextWord[], TextInputError> {
  if (text.length > TEXT_IMPORT_LIMITS.characters) {
    return failure(['inputTooLong']);
  }
  const collected = new Map<string, Collected>();
  for (const { segment } of sentenceSegmenter.segment(removeInvisibleControls(text))) {
    const sentence = segment.trim();
    const runs = runsOfSentence(sentence).map((run) => adjustRun(run, adjustments));
    runs
      .flatMap((run) => run.map((word, index) => ({ word, followedBy: run[index + 1]?.term })))
      .forEach(({ word, followedBy }, position) => {
        const entry =
          collected.get(termKey(word.language, word.term)) ??
          startCollecting(collected, word, { sentence, followedBy });
        entry.word.occurrences += 1;
        entry.seenInLowerCase ||= !word.capitalized;
        entry.capitalizedInsideSentence ||= word.capitalized && position > 0;
      });
  }
  return success(
    groupEnglishForms(
      [...collected.values()]
        .filter((entry) => !isObviousProperNoun(entry))
        .map(({ word }) => word),
    ),
  );
}

/** Counts a form (cats, played) with its base word when the text holds the base too. */
function groupEnglishForms(words: TextWord[]): TextWord[] {
  const englishByTerm = new Map(
    words.filter(({ language }) => language === 'en').map((word) => [word.term, word]),
  );
  return words.filter((word) => {
    const base = word.language === 'en' ? findBase(word.term, englishByTerm) : undefined;
    if (base === undefined) {
      return true;
    }
    base.occurrences += word.occurrences;
    base.forms.push(word.term);
    return false;
  });
}

function findBase(term: string, wordsByTerm: ReadonlyMap<string, TextWord>): TextWord | undefined {
  return baseFormCandidates(term)
    .map((candidate) => wordsByTerm.get(candidate))
    .find((base) => base !== undefined);
}
