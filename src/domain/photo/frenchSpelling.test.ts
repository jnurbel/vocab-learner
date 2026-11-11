import frenchWords from 'an-array-of-french-words/index.json';
import { describe, expect, it } from 'vitest';
import { createFrenchSpelling, MAX_CORRECTED_LENGTH } from './frenchSpelling';
import { NOTEBOOK_BLOCKS } from './notebookPhoto.fixtures';

const correct = createFrenchSpelling(frenchWords);

/** The meanings written by hand on the notebook page, as the Latin model read them. */
const NOTEBOOK_MEANINGS: readonly (readonly [read: string, written: string])[] = [
  ['enfantunique', 'enfant unique'],
  ['controlercontrgle', 'contrôler contrôle'],
  ['aug menter angmentation', 'augmenter augmentation'],
  ['vitesle', 'vitesse'],
  ['gouvecnement', 'gouvernement'],
  ['famille', 'famille'],
  ['géneralement, woyen', 'généralement, moyen'],
  ['chouchouter', 'chouchouter'],
  ['à parct...', 'à part'],
  ['grand-père', 'grand-père'],
  ['emperceur', 'empereur'],
  ['ecaractere', 'caractère'],
  ['goiste', 'égoïste'],
  ['tempérament', 'tempérament'],
  ['bésité', 'obésité'],
  ['tendre la maint', 'tendre la main'],
  ['shabiller', "s'habiller"],
  ['prire etsoeut', 'frère et soeur'],
  ["S'ocayer/ prendre soin", "s'occuper / prendre soin"],
  ['dire merci', 'dire merci'],
  ['politique', 'politique'],
  ['société', 'société'],
  ['partager', 'partager'],
];

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

  it('corrects the 30 meanings of a page in less than 300 ms', () => {
    const meanings = [
      ...NOTEBOOK_MEANINGS.map(([read]) => read),
      ...NOTEBOOK_BLOCKS.slice(0, 7).map(({ latin }) => latin.text),
    ];
    const start = performance.now();

    meanings.forEach((meaning) => correct(meaning));

    expect(meanings).toHaveLength(30);
    expect(performance.now() - start).toBeLessThan(300);
  });
});
