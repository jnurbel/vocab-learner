import { describe, expect, it } from 'vitest';
import { baseFormCandidates } from './englishForms';

describe('baseFormCandidates', () => {
  it.each([
    ['cats', 'cat'],
    ['boxes', 'box'],
    ['likes', 'like'],
    ['studies', 'study'],
    ['played', 'play'],
    ['liked', 'like'],
    ['stopped', 'stop'],
    ['studied', 'study'],
    ['playing', 'play'],
    ['making', 'make'],
    ['running', 'run'],
  ])('proposes %s as a form of %s', (form, base) => {
    expect(baseFormCandidates(form)).toContain(base);
  });

  it.each(['cat', 'glass', 'is', 'red', 'king', 'sing'])(
    'proposes no base shorter than two letters nor for a word without ending: %s',
    (word) => {
      expect(baseFormCandidates(word).every((base) => base.length >= 2)).toBe(true);
    },
  );

  it('proposes nothing for a word without a plural, -ed or -ing ending', () => {
    expect(baseFormCandidates('cat')).toEqual([]);
  });

  it('does not take the double s of a word for a plural', () => {
    expect(baseFormCandidates('glass')).toEqual([]);
  });
});
