import { describe, expect, it } from 'vitest';
import { createLabel, LABEL_NAME_MAX_LENGTH } from './label';

const context = { id: 'label-1', now: '2026-11-05T10:00:00.000Z' };

describe('createLabel', () => {
  it('creates a label with a trimmed name that is not a focus by default', () => {
    expect(createLabel('  Leçon 7 ', context)).toEqual({
      ok: true,
      value: {
        id: 'label-1',
        name: 'Leçon 7',
        isFocus: false,
        createdAt: context.now,
        updatedAt: context.now,
      },
    });
  });

  it('rejects a blank name', () => {
    expect(createLabel(' \n ', context)).toEqual({ ok: false, errors: ['required'] });
  });

  it('accepts a name at the maximum length and rejects a longer one', () => {
    expect(createLabel('a'.repeat(LABEL_NAME_MAX_LENGTH), context).ok).toBe(true);
    expect(createLabel('a'.repeat(LABEL_NAME_MAX_LENGTH + 1), context)).toEqual({
      ok: false,
      errors: ['tooLong'],
    });
  });
});
