import { describe, expect, it } from 'vitest';
import { toneSegments } from './toneSyllables';

describe('toneSegments', () => {
  it('gives each syllable its tone, from 1 to 4 or neutral, keeping the separators as plain text', () => {
    expect(toneSegments('mā má mǎ mà ma')).toEqual([
      { text: 'mā', tone: 1 },
      { text: ' ' },
      { text: 'má', tone: 2 },
      { text: ' ' },
      { text: 'mǎ', tone: 3 },
      { text: ' ' },
      { text: 'mà', tone: 4 },
      { text: ' ' },
      { text: 'ma', tone: 'neutral' },
    ]);
  });
});
