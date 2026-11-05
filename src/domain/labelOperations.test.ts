import { describe, expect, it } from 'vitest';
import type { Label } from './label';
import { findOrCreateLabel, renameLabel } from './labelOperations';

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
