import { describe, expect, it } from 'vitest';
import { applyEntryEdits, type EntryEdit } from './batchEdits';
import type { BulkEntries } from './bulkEntryParser';

const batch: BulkEntries = {
  entries: [
    { lineNumber: 1, language: 'zh', term: '你好', pinyin: 'nǐ hǎo', translation: 'bonjour' },
    { lineNumber: 2, language: 'en', term: 'aple', translation: 'pomme' },
    { lineNumber: 4, language: 'zh', term: '谢谢', translation: 'merci' },
  ],
  errors: [{ lineNumber: 3, reason: 'missingTranslation' }],
};

function edits(entries: Record<number, EntryEdit>): Map<number, EntryEdit> {
  return new Map(Object.entries(entries).map(([line, edit]) => [Number(line), edit]));
}

describe('applyEntryEdits', () => {
  it('leaves the batch as parsed when nothing was corrected', () => {
    expect(applyEntryEdits(batch, new Map())).toEqual(batch);
  });

  it('applies the corrections of the term, the pinyin and the meaning of a line', () => {
    const edited = applyEntryEdits(
      batch,
      edits({
        1: { pinyin: 'ni2 hao3' },
        2: { term: ' apple ', translation: 'une pomme' },
      }),
    );

    expect(edited.entries).toEqual([
      { lineNumber: 1, language: 'zh', term: '你好', pinyin: 'ní hǎo', translation: 'bonjour' },
      { lineNumber: 2, language: 'en', term: 'apple', translation: 'une pomme' },
      batch.entries[2],
    ]);
    expect(edited.errors).toEqual(batch.errors);
  });
});
