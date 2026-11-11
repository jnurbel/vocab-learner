import { describe, expect, it } from 'vitest';
import { ACCESS_CODE_LENGTH, checkAccessCode } from './accessCode';

describe('checkAccessCode', () => {
  it('accepts the code given by the parent, without the spaces around it', () => {
    expect(checkAccessCode('  famille-Li-2026  ')).toEqual({ ok: true, value: 'famille-Li-2026' });
  });

  it('accepts a code of 8 to 64 characters, with spaces inside', () => {
    expect(checkAccessCode('a'.repeat(ACCESS_CODE_LENGTH.min)).ok).toBe(true);
    expect(checkAccessCode('a'.repeat(ACCESS_CODE_LENGTH.max)).ok).toBe(true);
    expect(checkAccessCode('mon code secret').ok).toBe(true);
  });

  it('refuses a code that is empty or too short', () => {
    expect(checkAccessCode('')).toEqual({ ok: false, errors: ['tooShort'] });
    expect(checkAccessCode('   ')).toEqual({ ok: false, errors: ['tooShort'] });
    expect(checkAccessCode('a'.repeat(ACCESS_CODE_LENGTH.min - 1))).toEqual({
      ok: false,
      errors: ['tooShort'],
    });
  });

  it('refuses a code that is too long', () => {
    expect(checkAccessCode('a'.repeat(ACCESS_CODE_LENGTH.max + 1))).toEqual({
      ok: false,
      errors: ['tooLong'],
    });
  });

  it('refuses control characters, which could split the request header', () => {
    expect(checkAccessCode('famille\r\nX-Evil: 1')).toEqual({
      ok: false,
      errors: ['invalidCharacters'],
    });
    expect(checkAccessCode('famille\u0000li')).toEqual({
      ok: false,
      errors: ['invalidCharacters'],
    });
    expect(checkAccessCode('famille\tli')).toEqual({ ok: false, errors: ['invalidCharacters'] });
  });

  it('refuses characters a request header cannot carry: accents, hanzi, emoji', () => {
    expect(checkAccessCode('famille-éléphant').ok).toBe(false);
    expect(checkAccessCode('famille-李家-2026').ok).toBe(false);
    expect(checkAccessCode(`famille-${String.fromCodePoint(0x1f600)}`).ok).toBe(false);
  });
});
