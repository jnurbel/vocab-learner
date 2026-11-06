import {
  checkEntry,
  type BulkEntries,
  type BulkEntry,
  type BulkLineError,
} from './bulkEntryParser';

/** A correction made in the preview; a missing field keeps the parsed value. */
export interface EntryEdit {
  term?: string;
  pinyin?: string;
  translation?: string;
}

/** Applies the preview corrections, keyed by line number, and checks the corrected lines again. */
export function applyEntryEdits(
  batch: BulkEntries,
  edits: ReadonlyMap<number, EntryEdit>,
): BulkEntries {
  const entries: BulkEntry[] = [];
  const errors: BulkLineError[] = [...batch.errors];
  for (const entry of batch.entries) {
    const edit = edits.get(entry.lineNumber);
    if (edit === undefined) {
      entries.push(entry);
      continue;
    }
    const checked = checkEntry(entry.lineNumber, {
      term: edit.term ?? entry.term,
      pinyin: edit.pinyin ?? entry.pinyin ?? '',
      translation: edit.translation ?? entry.translation,
    });
    if (checked.ok) {
      entries.push(checked.value);
    }
  }
  return { entries, errors };
}
