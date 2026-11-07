import { describe, expect, it } from 'vitest';
import { format, formatCount } from './format';

describe('format', () => {
  it('fills the known placeholders and leaves the unknown ones', () => {
    expect(format('{a} et {b}', { a: 1 })).toBe('1 et {b}');
  });
});

describe('formatCount', () => {
  const words = { one: '{count} mot', other: '{count} mots' };

  it('uses the singular for 0 and 1, as French does', () => {
    expect(formatCount(words, 0)).toBe('0 mot');
    expect(formatCount(words, 1)).toBe('1 mot');
  });

  it('uses the plural from 2 on, and fills the other placeholders', () => {
    expect(formatCount(words, 2)).toBe('2 mots');
    expect(formatCount({ one: '{count} {x}', other: '{count} {x}s' }, 12, { x: 'chat' })).toBe(
      '12 chats',
    );
  });
});
