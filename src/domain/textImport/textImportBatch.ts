import { checkEntry, collectEntries, type BulkEntries } from '../bulkEntryParser';
import { termKey } from '../card';
import { normalizeSenses } from '../meaning/senses';
import type { IgnoredTerm } from '../progressRecords';
import type { TextWord } from './textWords';

/** "Add", "I already know it", or "skip for this time". */
export type WordDecision = 'add' | 'known' | 'skip';

/** What the learner chose for a word of the text in the preview. */
export interface TextWordChoice {
  decision: WordDecision;
  pinyin?: string;
  translation?: string;
}

export interface TextImportBatch {
  /** The words to add, checked as typed entries; a row number locates each problem. */
  batch: BulkEntries;
  /** The words never to propose again. */
  ignoredTerms: IgnoredTerm[];
}

/** The key of a word in the choices: its identity in its language. */
export function textWordKey({ language, term }: Pick<TextWord, 'language' | 'term'>): string {
  return termKey(language, term);
}

/** Turns the choices made on the words of a text into the words to add and those to ignore. */
export function textImportBatch(
  words: readonly TextWord[],
  choices: ReadonlyMap<string, TextWordChoice>,
): TextImportBatch {
  const ignoredTerms: IgnoredTerm[] = [];
  const checked = words.flatMap((word, index) => {
    const choice = choices.get(textWordKey(word));
    if (choice?.decision === 'known') {
      ignoredTerms.push({ language: word.language, term: word.term });
    }
    if (choice?.decision !== 'add') {
      return [];
    }
    const entry = checkEntry(index + 1, {
      term: word.term,
      pinyin: choice.pinyin ?? '',
      translation: normalizeSenses(choice.translation ?? ''),
    });
    return entry.ok && word.sentence !== undefined
      ? [{ ...entry, value: { ...entry.value, example: word.sentence } }]
      : [entry];
  });
  return { batch: collectEntries(checked, []), ignoredTerms };
}
