import { describe, expect, it } from 'vitest';
import type { Card, Language } from './card';
import type { Label } from './label';
import { deleteLabel, findOrCreateLabel, mergeLabels, renameLabel } from './labelOperations';

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
