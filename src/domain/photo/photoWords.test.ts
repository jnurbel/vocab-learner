import { describe, expect, it } from 'vitest';
import type { PhotoRow } from './photoTable';
import {
  addWord,
  editWord,
  mergeWithNext,
  nextToCheck,
  notebookNote,
  photoWordsBatch,
  removeWord,
  toPhotoWords,
  type PhotoWord,
} from './photoWords';

const box = (y: number) => ({ x: 0, y, width: 1000, height: 100 });

function row(term: string, meaning: string, options: Partial<PhotoRow> = {}): PhotoRow {
  return {
    row: 0,
    box: box(0),
    term: { text: term, confidence: 0.99 },
    notebookPinyin: '',
    meaning: { text: meaning, confidence: 0.9 },
    ...options,
  };
}

const generate = (hanzi: string) =>
  ({ 政府: 'zhèngfǔ', 控制: 'kòngzhì', 政: 'zhèng' })[hanzi] ?? '';
const sure = (meaning: string) => ({ text: meaning, certain: true });

function words(rows: readonly PhotoRow[]): PhotoWord[] {
  return toPhotoWords(
    rows,
    rows.map(({ meaning }) => sure(meaning.text)),
    generate,
  );
}

describe('toPhotoWords', () => {
  it('computes the pinyin from the characters, never from the sheet', () => {
    const [word] = words([row('政府', 'gouvernement', { notebookPinyin: 'zhen fu' })]);

    expect(word).toEqual(
      expect.objectContaining({ term: '政府', pinyin: 'zhèngfǔ', meaning: 'gouvernement' }),
    );
  });

  it('takes the corrected meaning, and marks it to check when the correction is unsure', () => {
    const [word] = toPhotoWords(
      [row('一般', 'géneralement, woyen')],
      [{ text: 'géneralement, woyen', certain: false }],
      generate,
    );

    expect(word?.toCheck).toEqual({ term: false, meaning: true });
  });

  it('marks a word read with little confidence, or with no hanzi, to check', () => {
    const [unsure, latin] = words([
      row('除了', 'à part', { term: { text: '除了', confidence: 0.5 } }),
      row('kong', 'contrôler'),
    ]);

    expect(unsure?.toCheck.term).toBe(true);
    expect(latin?.toCheck.term).toBe(false);
  });

  it('marks an empty meaning to check, and an English word is never given a pinyin', () => {
    const [word] = words([row('wheel', '')]);

    expect(word).toEqual(
      expect.objectContaining({ pinyin: '', toCheck: { term: false, meaning: true } }),
    );
  });

  it('gives each word its own id and keeps the band of the photo where it stands', () => {
    const [first, second] = words([
      row('控制', 'contrôler'),
      row('政府', 'gouvernement', { box: box(100) }),
    ]);

    expect(first?.id).not.toBe(second?.id);
    expect(second?.box).toEqual(box(100));
  });
});

describe('toPhotoWords without its helpers', () => {
  it('proposes no pinyin while the pinyin generator is not loaded', () => {
    expect(
      toPhotoWords([row('控制', 'contrôler')], [sure('contrôler')], undefined)[0]?.pinyin,
    ).toBe('');
  });

  it('keeps the meaning as read, to check, when it could not be corrected (offline)', () => {
    const [word] = toPhotoWords([row('控制', 'controler')], [], generate);

    expect([word?.meaning, word?.toCheck.meaning]).toEqual(['controler', true]);
  });
});

describe('notebookNote', () => {
  it('shows the pinyin of the notebook when it differs from the right one', () => {
    expect(notebookNote({ pinyin: 'zhèngfǔ', notebookPinyin: 'zhen fu' })).toBe('zhen fu');
  });

  it('says nothing when the notebook only lacks the tones or the spaces', () => {
    expect(notebookNote({ pinyin: 'kòngzhì', notebookPinyin: 'kong zhi' })).toBeUndefined();
  });

  it('says nothing when the notebook has no pinyin', () => {
    expect(notebookNote({ pinyin: 'kòngzhì', notebookPinyin: '' })).toBeUndefined();
  });
});

describe('editing the words', () => {
  const list = words([
    row('政', 'gouver-'),
    row('府', 'nement', { box: box(100) }),
    row('控制', 'contrôler', { box: box(200) }),
  ]);

  it('recomputes the pinyin when the word is corrected, and the cell is checked', () => {
    const edited = editWord(list, list[0]?.id ?? '', { term: '控制' }, generate);

    expect([edited[0]?.term, edited[0]?.pinyin, edited[0]?.toCheck.term]).toEqual([
      '控制',
      'kòngzhì',
      false,
    ]);
  });

  it('keeps a pinyin typed by the learner, even when the word is corrected after', () => {
    const typed = editWord(list, list[2]?.id ?? '', { pinyin: 'kong4zhi4' }, generate);
    const edited = editWord(typed, list[2]?.id ?? '', { term: '控制了' }, generate);

    expect(edited[2]?.pinyin).toBe('kong4zhi4');
  });

  it('marks a corrected meaning as checked', () => {
    const edited = editWord(list, list[0]?.id ?? '', { meaning: 'gouvernement' }, generate);

    expect(edited[0]?.toCheck.meaning).toBe(false);
  });

  it('merges a word cut in two rows with the next one', () => {
    const merged = mergeWithNext(list, list[0]?.id ?? '', generate);

    expect(merged).toHaveLength(2);
    expect(merged[0]).toEqual(
      expect.objectContaining({
        term: '政府',
        pinyin: 'zhèngfǔ',
        meaning: 'gouver- nement',
        box: { x: 0, y: 0, width: 1000, height: 200 },
      }),
    );
  });

  it('merges English words with a space, and a word added by hand keeps the band of the other', () => {
    const english = addWord(words([row('to', 'emprunter'), row('borrow', '')]), undefined, 'added');

    const merged = mergeWithNext(
      mergeWithNext(english, english[0]?.id ?? '', generate),
      english[0]?.id ?? '',
      generate,
    );

    expect(merged).toEqual([
      expect.objectContaining({ term: 'to borrow', pinyin: '', box: box(0) }),
    ]);
  });

  it('keeps the other cell to check when only one is corrected', () => {
    const unsure = toPhotoWords(
      [row('除了', 'a part', { term: { text: '除了', confidence: 0.4 } })],
      [{ text: 'a part', certain: false }],
      generate,
    );
    const id = unsure[0]?.id ?? '';

    expect(editWord(unsure, id, { meaning: 'à part' }, generate)[0]?.toCheck).toEqual({
      term: true,
      meaning: false,
    });
    expect(editWord(unsure, id, { term: '除了…以外' }, generate)[0]?.toCheck).toEqual({
      term: false,
      meaning: true,
    });
  });

  it('keeps the band of a read word merged with a word added by hand after it', () => {
    const withAdded = addWord(list, list[2]?.id, 'added');

    expect(mergeWithNext(withAdded, list[2]?.id ?? '', generate)[2]?.box).toEqual(box(200));
  });

  it('gives a word added by hand the band of the read word merged into it', () => {
    const withAdded = addWord(list, list[0]?.id, 'added');

    expect(mergeWithNext(withAdded, 'added', generate)[1]?.box).toEqual(box(100));
  });

  it('does nothing when merging the last word', () => {
    expect(mergeWithNext(list, list[2]?.id ?? '', generate)).toEqual(list);
  });

  it('removes a word', () => {
    expect(removeWord(list, list[1]?.id ?? '').map(({ term }) => term)).toEqual(['政', '控制']);
  });

  it('adds a forgotten word after another, empty and to check', () => {
    const added = addWord(list, list[0]?.id ?? '', 'added-1');

    expect(added.map(({ id }) => id)).toEqual([list[0]?.id, 'added-1', list[1]?.id, list[2]?.id]);
    expect(added[1]).toEqual(
      expect.objectContaining({
        term: '',
        pinyin: '',
        meaning: '',
        box: undefined,
        toCheck: { term: true, meaning: true },
      }),
    );
  });

  it('adds a word at the end when no word is given', () => {
    expect(addWord(list, undefined, 'added-2').at(-1)?.id).toBe('added-2');
  });

  it('finds the next word to check after a given one, then from the top', () => {
    const checks = words([
      row('控制', 'contrôler'),
      row('政府', '', { box: box(100) }),
      row('除了', 'à part', { term: { text: '除了', confidence: 0.4 } }),
    ]);

    expect(nextToCheck(checks, undefined)).toBe(checks[1]?.id);
    expect(nextToCheck(checks, checks[1]?.id)).toBe(checks[2]?.id);
    expect(nextToCheck(checks, checks[2]?.id)).toBe(checks[1]?.id);
    expect(nextToCheck(words([row('控制', 'contrôler')]), undefined)).toBeUndefined();
  });
});

describe('photoWordsBatch', () => {
  it('checks the words as the bulk entry does, numbered as shown', () => {
    const batch = photoWordsBatch(
      words([row('控制', 'contrôler'), row('政府', ''), row('控制', 'maîtriser')]),
    );

    expect(batch.entries).toEqual([
      { lineNumber: 1, language: 'zh', term: '控制', pinyin: 'kòngzhì', translation: 'contrôler' },
    ]);
    expect(batch.errors).toEqual([
      { lineNumber: 2, reason: 'missingTranslation' },
      { lineNumber: 3, reason: 'duplicateInBatch', firstLineNumber: 1 },
    ]);
  });

  it('turns a pinyin typed with numbers into tone marks', () => {
    const list = words([row('控制', 'contrôler')]);

    const batch = photoWordsBatch(
      editWord(list, list[0]?.id ?? '', { pinyin: 'kong4zhi4' }, generate),
    );

    expect(batch.entries[0]?.pinyin).toBe('kòngzhì');
  });
});
