import { describe, expect, it } from 'vitest';
import { removeInvisibleControls } from './safeText';

/** Written as code points, so that the test source holds no invisible character. */
const bidi = (codePoint: number) => String.fromCodePoint(codePoint);

describe('removeInvisibleControls', () => {
  it('removes control characters and bidi overrides or isolates', () => {
    const text = `a\u0000b${bidi(0x202e)}c${bidi(0x2066)}d${bidi(0x200f)}e\u007Ff`;

    expect(removeInvisibleControls(text)).toBe('abcdef');
  });

  it('keeps the tabs and line breaks of a multiline text', () => {
    expect(removeInvisibleControls('a\tb\nc\r\nd')).toBe('a\tb\nc\r\nd');
  });
});
