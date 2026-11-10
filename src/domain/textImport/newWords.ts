import { termKey, type Language } from '../card';
import type { IgnoredTerm } from '../progressRecords';
import { COMMON_WORDS } from './commonWords';
import { baseFormCandidates } from './englishForms';
import type { TextWord } from './textWords';

interface Term {
  language: Language;
  term: string;
}

/** What a word of a pasted text must not be to be proposed. */
export interface NewWordFilter {
  /** The words of the learner's list. */
  knownTerms: readonly Term[];
  /** The words marked "I already know it". */
  ignoredTerms: readonly IgnoredTerm[];
  hideCommonWords: boolean;
}

/** The words of a text that are new to the learner, in the order of the text. */
export function keepNewWords(words: readonly TextWord[], filter: NewWordFilter): TextWord[] {
  const known = new Set(
    [...filter.knownTerms, ...filter.ignoredTerms].map(({ language, term }) =>
      termKey(language, term),
    ),
  );
  const isKnown = ({ language, term }: TextWord) =>
    [term, ...(language === 'en' ? baseFormCandidates(term) : [])].some((form) =>
      known.has(termKey(language, form)),
    );
  const isHidden = ({ language, term }: TextWord) =>
    filter.hideCommonWords && COMMON_WORDS[language].has(term);
  return words.filter((word) => !isKnown(word) && !isHidden(word));
}
