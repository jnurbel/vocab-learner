import { termKey, type Language } from '../card';
import { success, type Result } from '../result';

/** A word found in a pasted text, proposed for the learner's list. */
export interface TextWord {
  language: Language;
  term: string;
}

export type TextInputError = 'inputTooLong';

const wordSegmenter = new Intl.Segmenter('zh', { granularity: 'word' });

const CHINESE_WORD = /^\p{Script=Han}+$/u;
/** Latin letters, with inner apostrophes or hyphens (don't, well-known). */
const ENGLISH_WORD = /^\p{Script=Latin}+(?:['-]\p{Script=Latin}+)*$/u;
const TYPOGRAPHIC_APOSTROPHE = /[’ʼ]/g;

/** The word as it would be stored, or undefined for punctuation, numbers and other scripts. */
function toWord(segment: string): TextWord | undefined {
  if (CHINESE_WORD.test(segment)) {
    return { language: 'zh', term: segment };
  }
  const english = segment.replace(TYPOGRAPHIC_APOSTROPHE, "'");
  if (ENGLISH_WORD.test(english)) {
    return { language: 'en', term: english.toLowerCase() };
  }
  return undefined;
}

/** Extracts the words of a text, each once, in order of first appearance. */
export function extractTextWords(text: string): Result<TextWord[], TextInputError> {
  const words = new Map<string, TextWord>();
  for (const { segment, isWordLike } of wordSegmenter.segment(text)) {
    const word = isWordLike === true ? toWord(segment) : undefined;
    if (word !== undefined) {
      const key = termKey(word.language, word.term);
      if (!words.has(key)) {
        words.set(key, word);
      }
    }
  }
  return success([...words.values()]);
}
