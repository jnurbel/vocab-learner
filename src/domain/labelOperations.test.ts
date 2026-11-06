import { describe, expect, it } from 'vitest';
import type { Card, Language } from './card';
import type { Label } from './label';
import {
  countWordsByLabel,
  deleteLabel,
  findOrCreateLabel,
  mergeLabels,
  renameLabel,
  resolveLabelChoice,
} from './labelOperations';

const now = '2026-11-05T12:00:00.000Z';

function label(id: string, name: string): Label {
  return {
    id,
    name,
    isFocus: false,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
  };
}

describe('findOrCreateLabel', () => {
  it('creates a label whose name is new', () => {
    const result = findOrCreateLabel([label('l1', 'Animaux')], 'Leçon 7', { id: 'l2', now });

    expect(result).toEqual({
      ok: true,
      value: {
        label: { ...label('l2', 'Leçon 7'), createdAt: now, updatedAt: now },
        created: true,
      },
    });
  });

  it('reuses the label that already has this name, ignoring case and spaces', () => {
    const animals = label('l1', 'Animaux');

    expect(findOrCreateLabel([animals], '  animaux ', { id: 'l2', now })).toEqual({
      ok: true,
      value: { label: animals, created: false },
    });
  });

  it('rejects an invalid name', () => {
    expect(findOrCreateLabel([], '   ', { id: 'l1', now })).toEqual({
      ok: false,
      errors: ['required'],
    });
  });
});

describe('resolveLabelChoice', () => {
  const animals = label('l1', 'Animaux');
  const lesson = label('l2', 'Leçon 3');

  it('keeps the ticked labels, once each, when no name is typed', () => {
    expect(
      resolveLabelChoice([animals, lesson], ['l2', 'l1', 'l2'], '  ', { id: 'l3', now }),
    ).toEqual({ ok: true, value: { labelIds: ['l2', 'l1'], newLabel: undefined } });
  });

  it('adds the typed label, created when its name is new', () => {
    expect(resolveLabelChoice([animals], ['l1'], 'Verbes', { id: 'l3', now })).toEqual({
      ok: true,
      value: {
        labelIds: ['l1', 'l3'],
        newLabel: { ...label('l3', 'Verbes'), createdAt: now, updatedAt: now },
      },
    });
  });

  it('reuses the existing label of the typed name without creating it again', () => {
    expect(resolveLabelChoice([animals], ['l1'], 'ANIMAUX', { id: 'l3', now })).toEqual({
      ok: true,
      value: { labelIds: ['l1'], newLabel: undefined },
    });
  });

  it('rejects an over-long typed name', () => {
    expect(resolveLabelChoice([], [], 'L'.repeat(61), { id: 'l3', now })).toEqual({
      ok: false,
      errors: ['tooLong'],
    });
  });
});

describe('renameLabel', () => {
  const labels = [label('l1', 'Leçon 7'), label('l2', 'Animaux')];

  it('renames the label with a trimmed name and updates its timestamp', () => {
    expect(renameLabel(labels, 'l1', ' Leçon 7 : la fête ', now)).toEqual({
      ok: true,
      value: [{ ...label('l1', 'Leçon 7 : la fête'), updatedAt: now }, label('l2', 'Animaux')],
    });
  });

  it('allows changing only the case of its own name', () => {
    const result = renameLabel(labels, 'l2', 'ANIMAUX', now);

    expect(result.ok && result.value[1]?.name).toBe('ANIMAUX');
  });

  it('refuses a name already used by another label', () => {
    expect(renameLabel(labels, 'l1', 'animaux', now)).toEqual({ ok: false, errors: ['nameTaken'] });
  });

  it('refuses an invalid name', () => {
    expect(renameLabel(labels, 'l1', '', now)).toEqual({ ok: false, errors: ['required'] });
  });

  it('refuses to rename a label that does not exist', () => {
    expect(renameLabel(labels, 'unknown', 'Verbes', now)).toEqual({
      ok: false,
      errors: ['labelNotFound'],
    });
  });
});

function card(id: string, labelIds: string[], language: Language = 'zh'): Card {
  return {
    id,
    language,
    term: id,
    translation: id,
    labelIds,
    source: 'manual',
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
  };
}

describe('mergeLabels', () => {
  const lesson = label('lesson', 'Leçon 3');
  const animals = label('animals', 'Animaux');
  const verbs = label('verbs', 'Verbes');

  it('moves the words of the merged label to the kept label, without duplicate labels', () => {
    const cat = card('cat', ['lesson', 'animals']);
    const dog = card('dog', ['animals']);
    const run = card('run', ['verbs']);

    const result = mergeLabels([lesson, animals, verbs], [cat, dog, run], 'animals', 'lesson', now);

    expect(result).toEqual({
      ok: true,
      value: {
        labels: [lesson, verbs],
        cardsToUpdate: [
          { ...cat, labelIds: ['lesson'], updatedAt: now },
          { ...dog, labelIds: ['lesson'], updatedAt: now },
        ],
      },
    });
  });

  it('refuses to merge a label into itself', () => {
    expect(mergeLabels([lesson], [], 'lesson', 'lesson', now)).toEqual({
      ok: false,
      errors: ['sameLabel'],
    });
  });

  it('refuses to merge labels that do not exist', () => {
    expect(mergeLabels([lesson], [], 'unknown', 'lesson', now)).toEqual({
      ok: false,
      errors: ['labelNotFound'],
    });
    expect(mergeLabels([lesson], [], 'lesson', 'unknown', now)).toEqual({
      ok: false,
      errors: ['labelNotFound'],
    });
  });
});

describe('deleteLabel', () => {
  const lesson = label('lesson', 'Leçon 3');
  const animals = label('animals', 'Animaux');

  it('removes the label from its words but keeps the words, even without any label left', () => {
    const cat = card('cat', ['lesson', 'animals']);
    const dog = card('dog', ['animals']);
    const book = card('book', ['lesson']);

    expect(deleteLabel([lesson, animals], [cat, dog, book], 'animals', now)).toEqual({
      ok: true,
      value: {
        labels: [lesson],
        cardsToUpdate: [
          { ...cat, labelIds: ['lesson'], updatedAt: now },
          { ...dog, labelIds: [], updatedAt: now },
        ],
      },
    });
  });

  it('refuses to delete a label that does not exist', () => {
    expect(deleteLabel([lesson], [], 'unknown', now)).toEqual({
      ok: false,
      errors: ['labelNotFound'],
    });
  });
});

describe('countWordsByLabel', () => {
  it('lists every label in alphabetical order with the number of its words', () => {
    const lesson = label('lesson', 'Leçon 3');
    const animals = label('animals', 'Animaux');
    const empty = label('empty', 'écriture');
    const cards = [card('cat', ['lesson', 'animals']), card('dog', ['animals'])];

    expect(countWordsByLabel([lesson, empty, animals], cards)).toEqual([
      { label: animals, wordCount: 2 },
      { label: empty, wordCount: 0 },
      { label: lesson, wordCount: 1 },
    ]);
  });
});
