import { CARD_LIMITS, termKey, type Language } from '../card';
import { success, type Result } from '../result';
import { codePointLength } from '../text';

/** A word found in a pasted text, proposed for the learner's list. */
export interface TextWord {
  language: Language;
  term: string;
  /** How many times the word appears in the text. */
  occurrences: number;
  /** The sentence where the word first appears, the example of its card; absent when too long. */
  sentence?: string;
}

export type TextInputError = 'inputTooLong';

const sentenceSegmenter = new Intl.Segmenter('zh', { granularity: 'sentence' });
const wordSegmenter = new Intl.Segmenter('zh', { granularity: 'word' });

const CHINESE_WORD = /^\p{Script=Han}+$/u;
/** Latin letters, with inner apostrophes or hyphens (don't, well-known). */
const ENGLISH_WORD = /^\p{Script=Latin}+(?:['-]\p{Script=Latin}+)*$/u;
const TYPOGRAPHIC_APOSTROPHE = /[’ʼ]/g;

type FoundWord = Pick<TextWord, 'language' | 'term'>;

/** The word as it would be stored, or undefined for punctuation, numbers and other scripts. */
function toWord(segment: string): FoundWord | undefined {
  if (CHINESE_WORD.test(segment)) {
    return { language: 'zh', term: segment };
  }
  const english = segment.replace(TYPOGRAPHIC_APOSTROPHE, "'");
  if (ENGLISH_WORD.test(english)) {
    return { language: 'en', term: english.toLowerCase() };
  }
  return undefined;
}

function wordsOfSentence(sentence: string): FoundWord[] {
  return [...wordSegmenter.segment(sentence)]
    .map(({ segment, isWordLike }) => (isWordLike === true ? toWord(segment) : undefined))
    .filter((word) => word !== undefined);
}

function asExample(sentence: string): string | undefined {
  return codePointLength(sentence) <= CARD_LIMITS.example ? sentence : undefined;
}

/** Extracts the words of a text, each once, in order of first appearance. */
export function extractTextWords(text: string): Result<TextWord[], TextInputError> {
  const words = new Map<string, TextWord>();
  for (const { segment } of sentenceSegmenter.segment(text)) {
    const sentence = segment.trim();
    for (const word of wordsOfSentence(sentence)) {
      const key = termKey(word.language, word.term);
      const known = words.get(key);
      if (known === undefined) {
        const example = asExample(sentence);
        words.set(key, {
          ...word,
          occurrences: 1,
          ...(example === undefined ? {} : { sentence: example }),
        });
      } else {
        known.occurrences += 1;
      }
    }
  }
  return success([...words.values()]);
}
