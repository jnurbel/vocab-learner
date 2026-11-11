import { describe, expect, it } from 'vitest';
import { normalizeSenses } from './senses';

describe('normalizeSenses', () => {
  it('turns a vertical bar between two senses into a slash', () => {
    expect(normalizeSenses('contrôler | contrôle')).toBe('contrôler / contrôle');
  });

  it.each([
    ['contrôler,contrôle', 'contrôler, contrôle'],
    ['contrôler ,  contrôle', 'contrôler, contrôle'],
    ['contrôler/contrôle', 'contrôler / contrôle'],
    ['contrôler  /contrôle', 'contrôler / contrôle'],
    ['contrôler|contrôle', 'contrôler / contrôle'],
  ])('harmonizes the spaces around the separators: "%s"', (typed, saved) => {
    expect(normalizeSenses(typed)).toBe(saved);
  });

  it.each([
    'se  laver (le matin) ; nettoyer',
    "l'eau, la mer",
    '2,5 kilos',
    'un 1/2 litre',
    '"gras" & $1 [fam.]',
  ])('leaves the rest of the meaning as it is: "%s"', (meaning) => {
    expect(normalizeSenses(meaning)).toBe(meaning);
  });

  it('turns a vertical bar between digits into a slash too: it separates the bulk fields', () => {
    expect(normalizeSenses('1|2')).toBe('1 / 2');
  });

  it('stays quick on a pasted huge text of spaces and separators', () => {
    const hostile = `${' '.repeat(50_000)}x${' ,'.repeat(25_000)}`;
    const start = performance.now();

    normalizeSenses(hostile);

    expect(performance.now() - start).toBeLessThan(100);
  });
});
