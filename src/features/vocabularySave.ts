import type { ImportChanges } from '../domain/importPlan';
import type { Label } from '../domain/label';
import type { IgnoredTerm } from '../domain/progressRecords';

/** What an entry form asks to store once the learner confirms. */
export interface VocabularySave {
  /** Set when the typed label did not exist and must be stored with the words. */
  newLabel: Label | undefined;
  changes: ImportChanges;
  /** The words marked "I already know it" in a text import, never proposed again. */
  ignoredTerms?: IgnoredTerm[];
}
