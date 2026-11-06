import { describe, expect, it } from 'vitest';
import { canonicalJson } from './canonicalJson';

describe('canonicalJson', () => {
  it('writes the same text whatever the order in which keys were added', () => {
    expect(canonicalJson({ b: 1, a: { d: [3, { y: 2, x: 1 }], c: 'é' } })).toBe(
      canonicalJson({ a: { c: 'é', d: [3, { x: 1, y: 2 }] }, b: 1 }),
    );
  });

  it('leaves out absent optional fields, as the saved file does', () => {
    expect(canonicalJson({ a: 1, pinyin: undefined })).toBe('{"a":1}');
  });

  it('matches the standard JSON text of the same content', () => {
    const value = { text: 'line\n"quoted"', list: [1.5, true, null], nested: { empty: [] } };

    expect(JSON.parse(canonicalJson(value))).toEqual(value);
  });
});
