import { describe, expect, it } from 'vitest';
import type { Label } from './label';
import { findOrCreateLabel } from './labelOperations';

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
