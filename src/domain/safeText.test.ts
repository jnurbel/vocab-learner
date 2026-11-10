import { describe, expect, it } from 'vitest';
import { removeInvisibleControls } from './safeText';

describe('removeInvisibleControls', () => {
  it('removes control characters and bidi overrides or isolates', () => {
    expect(removeInvisibleControls('a\u0000b‮c⁦d‏e\u007Ff')).toBe('abcdef');
  });

  it('keeps the tabs and line breaks of a multiline text', () => {
    expect(removeInvisibleControls('a\tb\nc\r\nd')).toBe('a\tb\nc\r\nd');
  });
});
