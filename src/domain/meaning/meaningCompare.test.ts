import { describe, expect, it } from 'vitest';
import { compareMeaning } from './meaningCompare';

describe('compareMeaning', () => {
  it('accepts any one of the senses of the stored translation', () => {
    const result = compareMeaning('durée', 'temps, durée');

    expect(result).toEqual({ outcome: 'correct', sense: 'durée' });
  });

  it('ignores case and accents, and gives back the stored sense', () => {
    expect(compareMeaning('ELEVE', 'élève')).toEqual({ outcome: 'correct', sense: 'élève' });
    expect(compareMeaning('Élève', 'eleve')).toEqual({ outcome: 'correct', sense: 'eleve' });
  });

  it.each([
    ['le temps', 'temps'],
    ['temps', 'le temps'],
    ['la maison', 'maison'],
    ['les gens', 'gens'],
    ["l'eau", 'eau'],
    ['un livre', 'livre'],
    ['une pomme', 'pomme'],
    ['des amis', 'amis'],
    ['du pain', 'pain'],
    ['de la farine', 'farine'],
    ["d'abord", 'abord'],
    ['L’école', 'école'],
  ])('ignores the leading article of "%s" against "%s"', (answer, translation) => {
    expect(compareMeaning(answer, translation).outcome).toBe('correct');
  });

  it('ignores what is between parentheses, in the translation and in the answer', () => {
    expect(compareMeaning('temps', 'temps (qui passe), durée')).toEqual({
      outcome: 'correct',
      sense: 'temps (qui passe)',
    });
    expect(compareMeaning('durée (longue)', 'temps (durée, moment)').outcome).toBe('wrong');
    expect(compareMeaning('temps (long)', 'temps (durée, moment)').outcome).toBe('correct');
  });

  it('ignores punctuation and repeated spaces', () => {
    expect(compareMeaning('  pomme   de  terre ! ', 'pomme de terre').outcome).toBe('correct');
    expect(compareMeaning('arc en ciel', 'arc-en-ciel').outcome).toBe('correct');
    expect(compareMeaning('bonjour.', '« bonjour »').outcome).toBe('correct');
  });

  it('splits the senses on semicolons, slashes and the word "ou"', () => {
    expect(compareMeaning('instant', 'temps; moment / instant').sense).toBe('instant');
    expect(compareMeaning('rapide', 'vite ou rapide')).toEqual({
      outcome: 'correct',
      sense: 'rapide',
    });
    expect(compareMeaning('vite', 'vite OU rapide').sense).toBe('vite');
    expect(compareMeaning('ici', 'où ici').outcome).toBe('wrong');
    expect(compareMeaning('couleur', 'couleur').outcome).toBe('correct');
  });

  it.each([
    ['contrôler', 'contrôler / contrôle'],
    ['contrôle', 'contrôler / contrôle'],
    ['contrôle', 'contrôler | contrôle'],
    ['contrôler', 'contrôler|contrôle'],
  ])(
    'accepts "%s", one sense of "%s", the vertical bar of older words included',
    (answer, meaning) => {
      expect(compareMeaning(answer, meaning).outcome).toBe('correct');
    },
  );

  it('does not split the senses on a vertical bar between parentheses', () => {
    expect(compareMeaning('a', 'b (a | c)').outcome).toBe('wrong');
  });

  it.each([
    ['laver', 'se laver'],
    ['se laver', 'laver'],
    ['appeler', "s'appeler"],
    ['s’appeler', 'appeler'],
  ])('makes the reflexive pronoun optional: "%s" for "%s"', (answer, translation) => {
    expect(compareMeaning(answer, translation).outcome).toBe('correct');
  });

  it('keeps a word that only starts like a reflexive pronoun', () => {
    expect(compareMeaning('cret', 'secret').outcome).toBe('wrong');
  });

  it('says "almost" for a single typo in a sense of at least six letters', () => {
    expect(compareMeaning('maisonn', 'maison, foyer')).toEqual({
      outcome: 'almost',
      sense: 'maison',
    });
    expect(compareMeaning('la mason', 'maison').outcome).toBe('almost');
  });

  it('is strict on short senses and on two typos', () => {
    expect(compareMeaning('chats', 'chat').outcome).toBe('wrong');
    expect(compareMeaning('maisson', 'maison').outcome).toBe('almost');
    expect(compareMeaning('maissonn', 'maison').outcome).toBe('wrong');
  });

  it('prefers an exact sense to an almost one', () => {
    expect(compareMeaning('maisons', 'maison, maisons')).toEqual({
      outcome: 'correct',
      sense: 'maisons',
    });
  });

  it('never accepts an empty answer, even against an empty sense', () => {
    expect(compareMeaning('', 'temps,, durée')).toEqual({ outcome: 'wrong' });
    expect(compareMeaning('  (rien) ', '(note)')).toEqual({ outcome: 'wrong' });
    expect(compareMeaning('le', 'le')).toEqual({ outcome: 'correct', sense: 'le' });
  });

  it('turns a stray separator or parenthesis into no acceptable sense', () => {
    expect(compareMeaning('x', 'temps,, ;')).toEqual({ outcome: 'wrong' });
    expect(compareMeaning('temps', 'temps) , durée')).toEqual({
      outcome: 'correct',
      sense: 'temps)',
    });
  });

  it('ignores invisible and bidirectional control characters', () => {
    expect(compareMeaning('mai\u200Bson\u202E', 'maison').outcome).toBe('correct');
    expect(compareMeaning('mai\nson', 'mai son').outcome).toBe('correct');
  });

  it('bounds a pasted huge answer so that the comparison stays quick', () => {
    const started = performance.now();

    const result = compareMeaning('maison '.repeat(200_000), 'maison');

    expect(result.outcome).toBe('wrong');
    expect(performance.now() - started).toBeLessThan(1_000);
  });

  it('treats regular expression and markup characters as plain text', () => {
    expect(compareMeaning('.*', 'temps').outcome).toBe('wrong');
    expect(compareMeaning('<script>alert(1)</script>', 'temps').outcome).toBe('wrong');
    expect(compareMeaning('temps', '<b>temps</b>').outcome).toBe('wrong');
  });

  it('keeps a word that only starts like an article', () => {
    expect(compareMeaning('ver', 'lever').outcome).toBe('wrong');
    expect(compareMeaning('ne', 'une').outcome).toBe('wrong');
  });
});
