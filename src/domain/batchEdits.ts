import { checkEntry, collectEntries, type BulkEntries } from './bulkEntryParser';

/** A correction made in the preview; a missing field keeps the parsed value. */
export interface EntryEdit {
  term?: string;
  pinyin?: string;
  translation?: string;
  /** An excluded line is left out of the import. */
  excluded?: boolean;
}

/** Applies the preview corrections, keyed by line number, and checks the corrected lines again. */
export function applyEntryEdits(
  batch: BulkEntries,
  edits: ReadonlyMap<number, EntryEdit>,
): BulkEntries {
  const checkedLines = batch.entries
    .filter(({ lineNumber }) => edits.get(lineNumber)?.excluded !== true)
    .map((entry) => {
      const edit = edits.get(entry.lineNumber) ?? {};
      return checkEntry(entry.lineNumber, {
        term: edit.term ?? entry.term,
        pinyin: edit.pinyin ?? entry.pinyin ?? '',
        translation: edit.translation ?? entry.translation,
      });
    });
  return collectEntries(checkedLines, batch.errors);
}
