import { describe, expect, it } from 'vitest';
import { contrast, themeTokens } from './contrast';

describe('contrast', () => {
  it('gives 21 for black on white and 1 for a colour on itself, in either order', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21);
    expect(contrast('#ffffff', '#000000')).toBeCloseTo(21);
    expect(contrast('#17705A', '#17705a')).toBeCloseTo(1);
  });

  it('matches the WCAG reference value of a mid grey on white', () => {
    expect(contrast('#767676', '#ffffff')).toBeCloseTo(4.54, 2);
  });

  it('refuses anything but #rrggbb colours', () => {
    expect(() => contrast('red', '#ffffff')).toThrow('#rrggbb');
    expect(() => contrast('#ffffff', '#fff')).toThrow('#rrggbb');
  });
});

describe('themeTokens', () => {
  it('reads the light tokens and lets the dark theme inherit the ones it does not override', () => {
    const css = `:root { --bg: #FFFFFF; --ink: #111111; --size: 1rem; }
      @media (prefers-color-scheme: dark) { :root { --bg: #000000; } }`;

    const { light, dark } = themeTokens(css);

    expect(Object.fromEntries(light)).toEqual({ bg: '#ffffff', ink: '#111111' });
    expect(Object.fromEntries(dark)).toEqual({ bg: '#000000', ink: '#111111' });
  });

  it('gives the same tokens to both themes when there is no dark theme', () => {
    const { light, dark } = themeTokens(':root { --bg: #ffffff; }');

    expect(dark).toEqual(light);
  });
});
