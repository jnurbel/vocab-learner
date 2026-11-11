import { checkEntry, collectEntries, detectLanguage, type BulkEntries } from '../bulkEntryParser';
import type { PinyinGenerator } from '../pinyinGeneration';
import { letterKey, type SpellingResult } from './frenchSpelling';
import type { Box } from './photoBlocks';
import type { PhotoRow } from './photoTable';

/** Which cells of a word the learner should look at before saving. */
export interface CellsToCheck {
  term: boolean;
  meaning: boolean;
}

/** A word of the photo preview, as the learner sees and corrects it. */
export interface PhotoWord {
  id: string;
  /** The band of the photo where the word was read; none for a word added by hand. */
  box: Box | undefined;
  term: string;
  pinyin: string;
  /** Typed by the learner: no longer computed from the word. */
  pinyinTyped: boolean;
  meaning: string;
  notebookPinyin: string;
  toCheck: CellsToCheck;
}

export type PhotoWordEdit = Partial<Pick<PhotoWord, 'term' | 'pinyin' | 'meaning'>>;

/** Below this, a word read on the photo is worth a look. */
const TERM_CONFIDENCE = 0.8;
/** Below this, a meaning read on the photo is worth a look, even when the spelling is sure. */
const MEANING_CONFIDENCE = 0.5;

function pinyinOf(term: string, generate: PinyinGenerator | undefined): string {
  return detectLanguage(term) === 'zh' ? (generate?.(term).trim() ?? '') : '';
}

/**
 * The words of the preview, from the rows read on the photo and their corrected meanings. The
 * pinyin is always computed from the characters: the one written on the sheet is only a note.
 */
export function toPhotoWords(
  rows: readonly PhotoRow[],
  meanings: readonly SpellingResult[],
  generate: PinyinGenerator | undefined,
): PhotoWord[] {
  return rows.map((row, index) => {
    const meaning = meanings[index] ?? { text: row.meaning.text, certain: false };
    return {
      id: `photo-word-${String(index)}`,
      box: row.box,
      term: row.term.text,
      pinyin: pinyinOf(row.term.text, generate),
      pinyinTyped: false,
      meaning: meaning.text,
      notebookPinyin: row.notebookPinyin,
      toCheck: {
        term: row.term.text === '' || row.term.confidence < TERM_CONFIDENCE,
        meaning:
          !meaning.certain || meaning.text === '' || row.meaning.confidence < MEANING_CONFIDENCE,
      },
    };
  });
}

/**
 * The pinyin written in the notebook, when it differs from the right one by more than its tones
 * or spaces: a point to learn, never a replacement of the computed pinyin.
 */
export function notebookNote(
  word: Pick<PhotoWord, 'pinyin' | 'notebookPinyin'>,
): string | undefined {
  const written = letterKey(word.notebookPinyin);
  return written === '' || written === letterKey(word.pinyin) ? undefined : word.notebookPinyin;
}

/** Applies a correction of the learner; the pinyin follows the word until typed by hand. */
export function editWord(
  words: readonly PhotoWord[],
  id: string,
  edit: PhotoWordEdit,
  generate: PinyinGenerator | undefined,
): PhotoWord[] {
  return words.map((word) => {
    if (word.id !== id) {
      return word;
    }
    const term = edit.term ?? word.term;
    const pinyinTyped = word.pinyinTyped || edit.pinyin !== undefined;
    return {
      ...word,
      term,
      pinyin: edit.pinyin ?? (pinyinTyped ? word.pinyin : pinyinOf(term, generate)),
      pinyinTyped,
      meaning: edit.meaning ?? word.meaning,
      toCheck: {
        term: word.toCheck.term && edit.term === undefined,
        meaning: word.toCheck.meaning && edit.meaning === undefined,
      },
    };
  });
}

function joinTerms(first: string, second: string): string {
  return detectLanguage(first) === 'zh' && detectLanguage(second) === 'zh'
    ? `${first}${second}`
    : `${first} ${second}`.trim();
}

function union(first: Box | undefined, second: Box | undefined): Box | undefined {
  if (first === undefined || second === undefined) {
    return first ?? second;
  }
  const x = Math.min(first.x, second.x);
  const y = Math.min(first.y, second.y);
  return {
    x,
    y,
    width: Math.max(first.x + first.width, second.x + second.width) - x,
    height: Math.max(first.y + first.height, second.y + second.height) - y,
  };
}

/** Joins a word cut over two rows of the photo with the next word. */
export function mergeWithNext(
  words: readonly PhotoWord[],
  id: string,
  generate: PinyinGenerator | undefined,
): PhotoWord[] {
  const index = words.findIndex((word) => word.id === id);
  const [first, second] = words.slice(index, index + 2);
  if (first === undefined || second === undefined) {
    return [...words];
  }
  const term = joinTerms(first.term, second.term);
  const merged: PhotoWord = {
    ...first,
    box: union(first.box, second.box),
    term,
    pinyin: pinyinOf(term, generate),
    pinyinTyped: false,
    meaning: `${first.meaning} ${second.meaning}`.trim(),
    notebookPinyin: `${first.notebookPinyin} ${second.notebookPinyin}`.trim(),
    toCheck: {
      term: first.toCheck.term || second.toCheck.term,
      meaning: first.toCheck.meaning || second.toCheck.meaning,
    },
  };
  return [...words.slice(0, index), merged, ...words.slice(index + 2)];
}

export function removeWord(words: readonly PhotoWord[], id: string): PhotoWord[] {
  return words.filter((word) => word.id !== id);
}

/** Adds an empty word, to type, after the given one (at the end without one). */
export function addWord(
  words: readonly PhotoWord[],
  afterId: string | undefined,
  id: string,
): PhotoWord[] {
  const added: PhotoWord = {
    id,
    box: undefined,
    term: '',
    pinyin: '',
    pinyinTyped: false,
    meaning: '',
    notebookPinyin: '',
    toCheck: { term: true, meaning: true },
  };
  const index = words.findIndex((word) => word.id === afterId);
  const at = index === -1 ? words.length : index + 1;
  return [...words.slice(0, at), added, ...words.slice(at)];
}

function needsCheck(word: PhotoWord): boolean {
  return word.toCheck.term || word.toCheck.meaning;
}

/** The next word to check after the given one, wrapping around to the top. */
export function nextToCheck(
  words: readonly PhotoWord[],
  afterId: string | undefined,
): string | undefined {
  const index = words.findIndex((word) => word.id === afterId);
  const after = words.slice(index + 1).find(needsCheck);
  return (after ?? words.find(needsCheck))?.id;
}

/** The words as a bulk entry batch, checked as typed ones, numbered as shown in the preview. */
export function photoWordsBatch(words: readonly PhotoWord[]): BulkEntries {
  return collectEntries(
    words.map((word, index) =>
      checkEntry(index + 1, { term: word.term, pinyin: word.pinyin, translation: word.meaning }),
    ),
    [],
  );
}

/** Gives their pinyin to the Chinese words still without one, unless the learner typed it. */
export function fillMissingPinyin(
  words: readonly PhotoWord[],
  generate: PinyinGenerator,
): PhotoWord[] {
  return words.map((word) =>
    word.pinyinTyped || word.pinyin !== ''
      ? word
      : { ...word, pinyin: pinyinOf(word.term, generate) },
  );
}
