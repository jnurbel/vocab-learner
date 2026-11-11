import frenchWords from 'an-array-of-french-words/index.json';
import { describe, expect, it } from 'vitest';
import { createFrenchSpelling, MAX_CORRECTED_LENGTH } from './frenchSpelling';
import { NOTEBOOK_MEANINGS } from './frenchSpelling.fixtures';

const correct = createFrenchSpelling(frenchWords);

describe('createFrenchSpelling', () => {
  it('keeps a word spelt right, sure of it', () => {
    expect(correct('famille')).toEqual({ text: 'famille', certain: true });
  });

  it('puts back the accents the handwriting lost', () => {
    expect(correct('controler')).toEqual({ text: 'contrôler', certain: true });
  });

  it('separates words written together', () => {
    expect(correct('diremerci')).toEqual({ text: 'dire merci', certain: true });
  });

  it("puts back an elided article or pronoun: s'habiller", () => {
    expect(correct('shabiller')).toEqual({ text: "s'habiller", certain: true });
  });

  it.each([
    ['vitesle', 'vitesse'],
    ['gouvecnement', 'gouvernement'],
    ['emperceur', 'empereur'],
  ])('fixes a letter misread in a long word: %s', (read, written) => {
    expect(correct(read)).toEqual({ text: written, certain: true });
  });

  it('reads the ligature œ as oe, as the dictionary writes it', () => {
    expect(correct('frère et sœur')).toEqual({ text: 'frère et soeur', certain: true });
  });

  it('never cuts a hyphenated word read with an error into an elision: grand-jère', () => {
    const result = correct('grand-jère');

    expect(result.text).not.toContain("j'");
    expect(result.certain).toBe(false);
  });

  it('keeps the commas, slashes and spaces between the meanings', () => {
    expect(correct('controler, controle/prendre soin').text).toBe(
      'contrôler, contrôle / prendre soin',
    );
  });

  it('corrects the words between parentheses apart, and keeps the parentheses', () => {
    expect(correct('controler(verbe)').text).toBe('contrôler (verbe)');
  });

  it('corrects each sense read on either side of a vertical bar, then shows a slash', () => {
    expect(correct('controler | controle')).toEqual({
      text: 'contrôler / contrôle',
      certain: true,
    });
    expect(correct('controler|controle').text).toBe('contrôler / contrôle');
  });

  it.each(['controler I controle', 'controler l controle'])(
    'reads a lone "I" or "l" between two words as a vertical bar: %s',
    (read) => {
      expect(correct(read)).toEqual({ text: 'contrôler / contrôle', certain: true });
    },
  );

  it.each([
    'prendre l avion',
    'prendre l habit',
    'l controle',
    'controler l',
    'tome I',
    'tome I Paris',
  ])('never takes for a bar a letter that may be read as is: %s', (read) => {
    expect(correct(read).text).not.toContain('/');
  });

  it('keeps the reading as it is, marked unsure, when no correction is sure', () => {
    expect(correct('zqxwvt')).toEqual({ text: 'zqxwvt', certain: false });
  });

  it('keeps a reading too long to correct as it is, unsure, without searching', () => {
    const long = 'a'.repeat(MAX_CORRECTED_LENGTH + 1);
    const start = performance.now();

    expect(correct(long)).toEqual({ text: long, certain: false });
    expect(performance.now() - start).toBeLessThan(50);
  });

  it('gives nothing for an empty reading', () => {
    expect(correct('  ')).toEqual({ text: '', certain: true });
  });

  it('keeps a short word with a misread letter as read: too many words are that close', () => {
    expect(correct('pome')).toEqual({ text: 'pome', certain: false });
  });

  it('does not join a word to the next when the reading has an error in each', () => {
    expect(correct('prire etsoeut').certain).toBe(false);
  });

  it('works with a small word list too', () => {
    const tiny = createFrenchSpelling(['pomme', 'roue']);

    expect(tiny('pommme')).toEqual({ text: 'pomme', certain: true });
    expect(tiny('poire')).toEqual({ text: 'poire', certain: false });
  });

  it('corrects most meanings of the notebook page, and never makes a sure change wrong', () => {
    const results = NOTEBOOK_MEANINGS.map(([read, written]) => ({
      read,
      written,
      ...correct(read),
    }));
    const right = results.filter(({ text, written }) => text === written);
    // "tendre la maint" is French as read ("maint": many): no dictionary can tell it is wrong.
    const wronglyChanged = results.filter(
      ({ read, certain, text, written }) => certain && text !== written && text !== read,
    );

    expect(right.length).toBeGreaterThanOrEqual(17);
    expect(wronglyChanged).toEqual([]);
  });
});
