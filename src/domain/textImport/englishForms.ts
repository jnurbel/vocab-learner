/** Shortest base form kept: "is" must not become "i". */
const MIN_BASE_LENGTH = 2;
const DOUBLED_CONSONANT = /([b-df-hj-np-tv-z])\1$/;

function undoubled(stem: string): string[] {
  return DOUBLED_CONSONANT.test(stem) ? [stem.slice(0, -1)] : [];
}

function pluralBases(word: string): string[] {
  if (word.endsWith('ies')) {
    return [`${word.slice(0, -3)}y`];
  }
  if (word.endsWith('es')) {
    return [word.slice(0, -2), word.slice(0, -1)];
  }
  if (word.endsWith('s') && !word.endsWith('ss')) {
    return [word.slice(0, -1)];
  }
  return [];
}

function pastBases(word: string): string[] {
  if (word.endsWith('ied')) {
    return [`${word.slice(0, -3)}y`];
  }
  if (word.endsWith('ed')) {
    const stem = word.slice(0, -2);
    return [stem, `${stem}e`, ...undoubled(stem)];
  }
  return [];
}

function progressiveBases(word: string): string[] {
  if (word.endsWith('ing')) {
    const stem = word.slice(0, -3);
    return [stem, `${stem}e`, ...undoubled(stem)];
  }
  return [];
}

/**
 * The words a lower-case English form may come from (plural, -ed, -ing): simple rules, so only
 * a proposal, kept when the base is found elsewhere (in the text or in the list).
 */
export function baseFormCandidates(word: string): string[] {
  return [...pluralBases(word), ...pastBases(word), ...progressiveBases(word)].filter(
    (base) => base.length >= MIN_BASE_LENGTH,
  );
}
