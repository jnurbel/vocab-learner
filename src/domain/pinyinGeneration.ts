import type { BulkEntry } from './bulkEntryParser';

/** Turns hanzi into pinyin with tone marks; injected so that the library can be replaced. */
export type PinyinGenerator = (hanzi: string) => string;

/** Fills in the pinyin of Chinese words that have none; the user can still correct it. */
export function completeMissingPinyin<Entry extends BulkEntry>(
  entries: readonly Entry[],
  generate: PinyinGenerator,
): Entry[] {
  return entries.map((entry) => {
    if (entry.language !== 'zh' || entry.pinyin !== undefined) {
      return entry;
    }
    const pinyin = generate(entry.term).trim();
    return pinyin === '' ? entry : { ...entry, pinyin };
  });
}
