/// <reference types="node" />
// Node types are needed here only, to read the stylesheets from disk.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { contrast, themeTokens } from './contrast';

const here = dirname(fileURLToPath(import.meta.url));
// Read from disk: Vitest does not process CSS, so a `?raw` import would be empty.
const themes = themeTokens(readFileSync(join(here, 'theme.css'), 'utf8'));

/** WCAG AA: 4.5:1 for text, 3:1 for large text and for the parts of a control. */
const TEXT = 4.5;
const NON_TEXT = 3;

/** Every foreground/background pair of tokens the app uses, with the contrast it needs. */
const PAIRS: readonly (readonly [foreground: string, background: string, minimum: number])[] = [
  // Body text, headings and secondary text on paper, cards and table headers.
  ['ink', 'bg', TEXT],
  ['ink', 'surface', TEXT],
  ['ink', 'surface-2', TEXT],
  ['ink-soft', 'bg', TEXT],
  ['ink-soft', 'surface', TEXT],
  ['muted', 'bg', TEXT],
  ['muted', 'surface', TEXT],
  ['muted', 'surface-2', TEXT],
  // Accent text: eyebrows, links, active menu entry, chosen chips, right answers.
  ['jade', 'bg', TEXT],
  ['jade', 'surface', TEXT],
  ['jade', 'surface-2', TEXT],
  ['jade-strong', 'surface', TEXT],
  ['jade-strong', 'jade-soft', TEXT],
  ['ink', 'jade-soft', TEXT],
  // Filled buttons: primary (jade) and dark (ink).
  ['on-jade', 'jade', TEXT],
  ['on-ink', 'ink', TEXT],
  // Mistakes and error messages, in ochre (the former red #b00020 failed on a dark background).
  ['ochre', 'bg', TEXT],
  ['ochre', 'surface', TEXT],
  ['ochre', 'ochre-soft', TEXT],
  ['ink', 'ochre-soft', TEXT],
  ['surface', 'ochre', TEXT],
  // Test countdown, thirst and reminders, neutral information.
  ['seal', 'seal-soft', TEXT],
  ['ink', 'seal-soft', TEXT],
  ['ink-soft', 'surface-2', TEXT],
  ['thirst', 'thirst-soft', TEXT],
  ['ink', 'thirst-soft', TEXT],
  ['info', 'info-soft', TEXT],
  // Controls: field and button borders, focus ring, progress fill on its track.
  ['line-strong', 'surface', NON_TEXT],
  ['line-strong', 'bg', NON_TEXT],
  ['focus', 'surface', NON_TEXT],
  ['focus', 'bg', NON_TEXT],
  ['jade', 'track', NON_TEXT],
  ['seal', 'track', NON_TEXT],
];

/** The colours of docs/ui/README.md, the reference of the light theme. */
const README_COLORS = {
  bg: '#f6f4ee',
  surface: '#ffffff',
  line: '#e3dfd5',
  ink: '#1e2a2f',
  muted: '#5b6770',
  jade: '#17705a',
  'jade-strong': '#0f4f3f',
  'jade-soft': '#e3f1ec',
  seal: '#8e2f1c',
  'seal-soft': '#fceee9',
  ochre: '#8a3d0b',
  'ochre-soft': '#fbe7d8',
  thirst: '#7a4a00',
  'thirst-soft': '#fff3dc',
};

describe('theme tokens', () => {
  it('takes the light colours from the README and gives each one a dark value', () => {
    for (const [name, color] of Object.entries(README_COLORS)) {
      expect(themes.light.get(name), name).toBe(color);
      expect(themes.dark.get(name), name).not.toBe(color);
    }
  });

  it('defines every token of the checked pairs, in light and dark', () => {
    for (const [foreground, background] of PAIRS) {
      for (const tokens of [themes.light, themes.dark]) {
        expect(tokens.get(foreground), foreground).toMatch(/^#[0-9a-f]{6}$/);
        expect(tokens.get(background), background).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  describe.each([
    ['light', themes.light],
    ['dark', themes.dark],
  ] as const)('%s theme', (_name, tokens) => {
    it.each(PAIRS)('reaches the AA contrast for %s on %s (at least %d:1)', (fg, bg, minimum) => {
      expect(contrast(tokens.get(fg) ?? '', tokens.get(bg) ?? '')).toBeGreaterThanOrEqual(minimum);
    });
  });
});

describe('stylesheets', () => {
  it('no longer hard-code the former error red, unreadable on a dark background', () => {
    const src = join(here, '..');
    const offenders = readdirSync(src, { recursive: true, encoding: 'utf8' })
      .filter((path) => /\.(svelte|css)$/.test(path))
      // The paths come from listing the source folder itself, not from any input.
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      .filter((path) => readFileSync(join(src, path), 'utf8').toLowerCase().includes('#b00020'));
    expect(offenders).toEqual([]);
  });
});
