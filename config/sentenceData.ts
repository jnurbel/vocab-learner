import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/** The sentence data of public/data/ (DESIGN.md 5 ter), loaded on the first sentence game. */
export const SENTENCE_DATA_FILES = ['sentences-zh.json', 'measure-words.json', 'hsk-words.json'];

/**
 * The service worker keeps the sentence data on first use (CacheFirst), under a cache named
 * after the content of the files: their names never change, so new data gets a cache of its
 * own instead of being hidden by the old one.
 */
export function sentenceDataCacheName(root: string): string {
  const hash = createHash('sha256');
  for (const file of SENTENCE_DATA_FILES) {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- listed files only
    hash.update(readFileSync(path.join(root, 'public', 'data', file)));
  }
  return `sentence-data-${hash.digest('hex').slice(0, 12)}`;
}
