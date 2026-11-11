import { isSenseSeparator, senseSeparatorText } from '../meaning/senses';

/** A meaning read on a photo, corrected when the correction is sure. */
export interface SpellingResult {
  text: string;
  /** False when the reading was kept as it is, for the learner to check. */
  certain: boolean;
}

export type FrenchSpelling = (read: string) => SpellingResult;

/** A longer reading is not a meaning of a vocabulary list: it is kept as it is, unsure. */
export const MAX_CORRECTED_LENGTH = 120;

/** The longest word looked for, in letters. */
const MAX_WORD_LENGTH = 24;
/** Each word found costs this much, so that a reading is not cut into many small words. */
const WORD_COST = 0.6;
/** Cutting where the reading has no space: words written together happen, but less often. */
const SPLIT_COST = 0.5;
/** Joining across a space of the reading: the reader puts stray spaces in handwriting. */
const JOIN_COST = 0.3;
/** "s", "l", "d"… before a word stand for "s'", "l'", "d'"… */
const ELISIONS = new Set(['c', 'd', 'j', 'l', 'm', 'n', 's', 't']);
const ELISION_COST = 0.3;
/** A sure correction fixes at most one letter in this many. */
const LETTERS_PER_ERROR = 8;
/** A letter that makes no word is kept as read, at a high cost. */
const STRAY_LETTER_COST = 1.5;
const LETTER_A = 'a'.charCodeAt(0);
type Parenthesis = '(' | ')';
const PARENTHESIS_TEXT: Readonly<Record<Parenthesis, string>> = {
  '(': ' (',
  ')': ') ',
};
const DIACRITIC = /\p{Diacritic}/gu;
const NOT_LETTER = /[^a-z]/g;

/** Lower case, without accents nor anything but letters: the key a word is looked up by. */
export function letterKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(DIACRITIC, '')
    .replace(NOT_LETTER, '');
}

function accentCount(word: string): number {
  return word.normalize('NFD').match(DIACRITIC)?.length ?? 0;
}

/** The words of a dictionary in a letter tree, in typed arrays: compact and quick to walk. */
interface LetterTree {
  firstChild: Int32Array;
  nextSibling: Int32Array;
  letter: Uint8Array;
  /** The index of the key ending at a node, or -1. */
  keyIndex: Int32Array;
  /** The ways each key is written, by key index. */
  forms: string[][];
}

/** Reads a typed array where the index is known to be in range (no `undefined` to handle). */
function at(array: Int32Array | Uint8Array, index: number): number {
  return Number(array[index]);
}

function commonPrefix(first: string, second: string): number {
  let length = 0;
  while (length < first.length && first[length] === second[length]) {
    length += 1;
  }
  return length;
}

function buildTree(words: readonly string[]): LetterTree {
  const forms = new Map<string, string[]>();
  for (const word of words) {
    const key = letterKey(word);
    if (key !== '' && key.length <= MAX_WORD_LENGTH) {
      forms.set(key, [...(forms.get(key) ?? []), word]);
    }
  }
  const sorted = [...forms.entries()].sort(([one], [other]) => (one < other ? -1 : 1));
  const keys = sorted.map(([key]) => key);
  let size = 1;
  keys.reduce((previous, key) => {
    size += key.length - commonPrefix(previous, key);
    return key;
  }, '');
  const tree: LetterTree = {
    firstChild: new Int32Array(size).fill(-1),
    nextSibling: new Int32Array(size).fill(-1),
    letter: new Uint8Array(size),
    keyIndex: new Int32Array(size).fill(-1),
    forms: sorted.map(([, written]) => written),
  };
  const lastChild = new Int32Array(size).fill(-1);
  const path = new Int32Array(MAX_WORD_LENGTH + 1);
  let created = 1;
  keys.reduce((previous, key, index) => {
    const shared = commonPrefix(previous, key);
    for (let depth = shared; depth < key.length; depth += 1) {
      const parent = at(path, depth);
      const node = created;
      created += 1;
      tree.letter[node] = key.charCodeAt(depth) - LETTER_A;
      if (at(lastChild, parent) === -1) {
        tree.firstChild[parent] = node;
      } else {
        tree.nextSibling[at(lastChild, parent)] = node;
      }
      lastChild[parent] = node;
      path[depth + 1] = node;
    }
    tree.keyIndex[at(path, key.length)] = index;
    return key;
  }, '');
  return tree;
}

/** The edit distance allowed for a stretch of this many letters. */
function allowedDistance(length: number): number {
  if (length <= 2) {
    return 0;
  }
  return length <= 5 ? 1 : 2;
}

interface Match {
  key: number;
  distance: number;
  /** Another word as close: the correction would be a guess. */
  tied: boolean;
}

/** The largest edit distance ever allowed: the rows are only computed within this band. */
const MAX_DISTANCE = 2;
const FAR = MAX_DISTANCE + 1;

/**
 * The closest word to each stretch of `letters` that starts at `start`, by walking the tree once
 * with the rows of the edit distance (Levenshtein). Only the diagonal band of the rows within
 * the largest distance allowed is computed, and a branch is left as soon as it goes beyond.
 */
function matchesFrom(tree: LetterTree, letters: Uint8Array, start: number): (Match | undefined)[] {
  const width = Math.min(MAX_WORD_LENGTH, letters.length - start);
  const stride = width + 2;
  const best = new Array<Match | undefined>(width + 1).fill(undefined);
  // One row per depth in the tree; the cells out of the band hold FAR.
  const rows = new Int32Array((MAX_WORD_LENGTH + 2) * stride).fill(FAR);
  for (let column = 0; column <= Math.min(width, MAX_DISTANCE); column += 1) {
    rows[column] = column;
  }
  const visit = (node: number, depth: number): void => {
    const previous = (depth - 1) * stride;
    const row = depth * stride;
    const letter = at(tree.letter, node);
    const low = Math.max(1, depth - MAX_DISTANCE);
    const high = Math.min(width, depth + MAX_DISTANCE);
    rows[row] = Math.min(depth, FAR);
    rows[row + low - 1] = low === 1 ? Math.min(depth, FAR) : FAR;
    rows[row + high + 1] = FAR;
    let lowest = at(rows, row);
    for (let column = low; column <= high; column += 1) {
      const same = at(letters, start + column - 1) === letter ? 0 : 1;
      const value = Math.min(
        FAR,
        at(rows, previous + column) + 1,
        at(rows, row + column - 1) + 1,
        at(rows, previous + column - 1) + same,
      );
      rows[row + column] = value;
      lowest = Math.min(lowest, value);
    }
    const key = at(tree.keyIndex, node);
    if (key !== -1) {
      for (let column = low; column <= high; column += 1) {
        const distance = at(rows, row + column);
        const current = best[column];
        if (distance > allowedDistance(column)) {
          continue;
        }
        if (current === undefined || distance < current.distance) {
          best[column] = { key, distance, tied: false };
        } else if (distance === current.distance) {
          current.tied = true;
        }
      }
    }
    if (lowest > MAX_DISTANCE || depth >= width + MAX_DISTANCE) {
      return;
    }
    // At the largest distance already, only a child matching the next letter of a cell at that
    // distance can stay within it: the others are left without computing their row.
    let wanted = ~0;
    if (lowest === MAX_DISTANCE) {
      wanted = 0;
      for (let column = low; column <= Math.min(high, width - 1); column += 1) {
        if (at(rows, row + column) === MAX_DISTANCE) {
          wanted |= 1 << at(letters, start + column);
        }
      }
    }
    for (let child = at(tree.firstChild, node); child !== -1; child = at(tree.nextSibling, child)) {
      if ((wanted & (1 << at(tree.letter, child))) !== 0) {
        visit(child, depth + 1);
      }
    }
  };
  for (let child = at(tree.firstChild, 0); child !== -1; child = at(tree.nextSibling, child)) {
    visit(child, 1);
  }
  return best;
}

/** The way a dictionary word is written: the one read, else the one with the fewest accents. */
function formOf(tree: LetterTree, key: number, readWords: readonly string[]): string | undefined {
  const forms = tree.forms.slice(key, key + 1).flat();
  const read = forms.find((form) => readWords.includes(form));
  if (read !== undefined) {
    return read;
  }
  const fewest = Math.min(...forms.map(accentCount));
  const plainest = forms.filter((form) => accentCount(form) === fewest);
  return plainest.length === 1 ? plainest[0] : undefined;
}

/** A word of the corrected reading. */
interface Candidate {
  cost: number;
  text: string;
  sure: boolean;
  /** The letters fixed. */
  distance: number;
  /** Read as written, or kept as a stray letter: a word glued to it may start right after. */
  exact: boolean;
}

/** The cheapest reading found up to a letter. */
interface Path {
  cost: number;
  words: Candidate[];
  /** Whether a word may start right after: see `Candidate.exact`. */
  open: boolean;
}

/** The letters of a reading, and whether a space (or an apostrophe) comes before each. */
function lettersOf(phrase: string): { key: string; spaceBefore: boolean[] } {
  let key = '';
  const spaceBefore: boolean[] = [];
  // The first letter starts a word, as after a space.
  let space = true;
  for (const character of phrase) {
    const letters = letterKey(character);
    if (letters === '') {
      // A hyphen ties the parts of one word (grand-père): no word starts after it.
      space ||= character !== '-';
      continue;
    }
    spaceBefore.push(space, ...Array.from(letters.slice(1), () => false));
    key += letters;
    space = false;
  }
  return { key, spaceBefore };
}

interface Stretch {
  tree: LetterTree;
  key: string;
  spaceBefore: readonly boolean[];
  matchesFrom: (start: number) => readonly (Match | undefined)[];
  readWords: readonly string[];
}

/** The word closest to the letters from `start` to `end`, written as in the dictionary. */
function wordAt(stretch: Stretch, start: number, end: number): Candidate | undefined {
  const length = end - start;
  const match = stretch.matchesFrom(start)[length];
  const form = match === undefined ? undefined : formOf(stretch.tree, match.key, stretch.readWords);
  if (match === undefined || form === undefined) {
    return undefined;
  }
  const joined = stretch.spaceBefore.slice(start + 1, end).filter(Boolean).length;
  return {
    cost: match.distance + WORD_COST + joined * JOIN_COST,
    text: form,
    sure: match.distance === 0 || (!match.tied && length >= 5),
    distance: match.distance,
    exact: match.distance === 0,
  };
}

function strayLetter(letter: string): Candidate {
  return {
    cost: STRAY_LETTER_COST + WORD_COST,
    text: letter,
    sure: false,
    distance: 1,
    exact: true,
  };
}

/** The ways to read the letters from `start` to `end` as one word, when a word may start. */
function candidatesOf(stretch: Stretch, start: number, end: number): Candidate[] {
  const split = stretch.spaceBefore[start] === true ? 0 : SPLIT_COST;
  const candidates: Candidate[] = [];
  const word = wordAt(stretch, start, end);
  if (word !== undefined) {
    candidates.push(word);
  }
  const first = stretch.key.slice(start, start + 1);
  const elided =
    ELISIONS.has(first) && end - start > 1 ? wordAt(stretch, start + 1, end) : undefined;
  if (elided !== undefined) {
    candidates.push({
      ...elided,
      cost: elided.cost + ELISION_COST,
      text: `${first}'${elided.text}`,
    });
  }
  return candidates.map((candidate) => ({ ...candidate, cost: candidate.cost + split }));
}

/** Cuts a stretch of letters into dictionary words at the lowest cost, then writes them. */
function correctPhrase(tree: LetterTree, phrase: string): SpellingResult {
  const { key, spaceBefore } = lettersOf(phrase);
  const letters = Uint8Array.from(key, (character) => character.charCodeAt(0) - LETTER_A);
  const matches = new Map<number, (Match | undefined)[]>();
  const stretch: Stretch = {
    tree,
    key,
    spaceBefore,
    matchesFrom: (start) => {
      const known = matches.get(start) ?? matchesFrom(tree, letters, start);
      matches.set(start, known);
      return known;
    },
    readWords: phrase.toLowerCase().split(/[\s']+/),
  };
  const best: Path[] = Array.from({ length: key.length + 1 }, (_, end) => ({
    cost: end === 0 ? 0 : Infinity,
    words: [],
    open: true,
  }));
  const costs = Float64Array.from(best, ({ cost }) => cost);
  const offer = (end: number, before: Path, candidate: Candidate) => {
    const cost = before.cost + candidate.cost;
    if (cost < Number(costs[end])) {
      costs[end] = cost;
      best[end] = { cost, words: [...before.words, candidate], open: candidate.exact };
    }
  };
  for (const [start, before] of best.entries()) {
    if (start < key.length) {
      // Any letter may stay as read, so that the end is always reached.
      offer(start + 1, before, strayLetter(key.slice(start, start + 1)));
    }
    // A word starts after a space read, or right after a word read as written: looking for
    // words everywhere else would cost much and rarely find the right cut.
    if (!before.open && spaceBefore[start] !== true) {
      continue;
    }
    for (let end = start + 1; end <= Math.min(key.length, start + MAX_WORD_LENGTH); end += 1) {
      for (const candidate of candidatesOf(stretch, start, end)) {
        offer(end, before, candidate);
      }
    }
  }
  const { words } = best.reduce((_, path) => path);
  const distance = words.reduce((total, word) => total + word.distance, 0);
  return {
    text: words.map(({ text }) => text).join(' '),
    certain:
      words.every(({ sure }) => sure) &&
      distance <= Math.max(1, Math.floor(key.length / LETTERS_PER_ERROR)),
  };
}

function isParenthesis(character: string): character is Parenthesis {
  return character === '(' || character === ')';
}

/**
 * The reading cut at the separators of the senses and at the parentheses, kept as the odd parts:
 * each part between them is corrected alone.
 */
function cutAtSeparators(read: string): string[] {
  const parts: string[] = [];
  let part = '';
  for (const character of read) {
    if (isSenseSeparator(character) || isParenthesis(character)) {
      parts.push(part, character);
      part = '';
    } else {
      part += character;
    }
  }
  parts.push(part);
  return parts;
}

function tidy(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Corrects the French meanings read on a photo with a dictionary: accents put back, words
 * written together separated, elisions restored, a misread letter fixed. A correction is only
 * made when it is sure; otherwise the reading is kept as it is and marked unsure.
 */
export function createFrenchSpelling(words: readonly string[]): FrenchSpelling {
  const tree = buildTree(words);
  return (read) => {
    if (read.length > MAX_CORRECTED_LENGTH) {
      return { text: read.trim(), certain: false };
    }
    const parts = cutAtSeparators(read.replace(/\.+|…/g, ' '));
    let certain = true;
    const text = parts
      .map((part, index) => {
        if (index % 2 === 1) {
          // The odd parts are the separators kept by cutAtSeparators.
          return isSenseSeparator(part)
            ? senseSeparatorText(part)
            : PARENTHESIS_TEXT[part as Parenthesis];
        }
        if (letterKey(part) === '') {
          return '';
        }
        const corrected = correctPhrase(tree, part);
        certain &&= corrected.certain;
        return corrected.certain ? corrected.text : tidy(part);
      })
      .join('');
    return { text: tidy(text), certain };
  };
}
