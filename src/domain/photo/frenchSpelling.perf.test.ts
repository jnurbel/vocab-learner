import frenchWords from 'an-array-of-french-words/index.json';
import { describe, expect, it } from 'vitest';
import { createFrenchSpelling } from './frenchSpelling';
import { NOTEBOOK_BLOCKS } from './notebookPhoto.fixtures';
import { NOTEBOOK_MEANINGS } from './frenchSpelling.fixtures';

describe('createFrenchSpelling, timed', () => {
  it('corrects the 30 meanings of a page in less than 300 ms', () => {
    const meanings = [
      ...NOTEBOOK_MEANINGS.map(([read]) => read),
      ...NOTEBOOK_BLOCKS.slice(0, 7).map(({ latin }) => latin.text),
    ];
    // A fresh spelling each time, so that no reading is remembered. The best of three passes,
    // after one to warm up, measures the correction rather than the other tests run alongside.
    const timeOnce = () => {
      const fresh = createFrenchSpelling(frenchWords);
      const start = performance.now();
      meanings.forEach((meaning) => fresh(meaning));
      return performance.now() - start;
    };
    timeOnce();

    expect(meanings).toHaveLength(30);
    expect(Math.min(timeOnce(), timeOnce(), timeOnce())).toBeLessThan(300);
  });
});
