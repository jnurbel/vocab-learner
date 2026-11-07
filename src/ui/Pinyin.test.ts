/// <reference types="node" />
// Node types are needed here only, to read the stylesheet from disk.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { contrast, themeTokens } from './contrast';
import Pinyin from './Pinyin.svelte';

// Read from disk: Vitest does not process CSS, so a `?raw` import would be empty.
const here = dirname(fileURLToPath(import.meta.url));
const tonesCss = readFileSync(join(here, 'tones.css'), 'utf8');
const themes = themeTokens(readFileSync(join(here, 'theme.css'), 'utf8'));
/** Pinyin shows on the paper, on the cards and in table headers. */
const BACKGROUNDS = ['bg', 'surface', 'surface-2'];

describe('Pinyin', () => {
  it('colours each syllable by tone while keeping the tone marks in the text', () => {
    const { container } = render(Pinyin, { pinyin: 'nǐ hǎo ma, māmá' });

    const toned = [...container.querySelectorAll('[class*="tone-"]')].map((element) => [
      element.textContent,
      [...element.classList].find((name) => name.startsWith('tone-')),
    ]);
    expect(toned).toEqual([
      ['nǐ', 'tone-3'],
      ['hǎo', 'tone-3'],
      ['ma', 'tone-neutral'],
      ['mā', 'tone-1'],
      ['má', 'tone-2'],
    ]);
    // The colour only doubles the diacritic: the text itself is unchanged.
    expect(container.textContent).toBe('nǐ hǎo ma, māmá');
  });

  it('shows text that is not pinyin as it is, without any colour', () => {
    const { container } = render(Pinyin, { pinyin: '<b>gras</b>' });

    expect(container.textContent).toBe('<b>gras</b>');
    expect(container.querySelector('b')).toBeNull();
    expect(container.querySelector('[class*="tone-"]')).toBeNull();
  });
});

function paletteOf(css: string): Map<string, string> {
  return new Map(
    [...css.matchAll(/\.(tone-[\w-]+)\s*\{\s*color:\s*(#[0-9a-f]{6})/gi)].map(([, name, color]) => [
      name ?? '',
      (color ?? '').toLowerCase(),
    ]),
  );
}

describe('tone colours', () => {
  const [light = '', dark = ''] = tonesCss.split('@media (prefers-color-scheme: dark)');
  const tones = ['tone-1', 'tone-2', 'tone-3', 'tone-4', 'tone-neutral'];

  it('defines red, green, blue, purple and grey for every tone, in light and dark themes', () => {
    expect([...paletteOf(light).keys()].sort()).toEqual(tones);
    expect([...paletteOf(dark).keys()].sort()).toEqual(tones);
  });

  it('reaches the WCAG AA contrast of 4.5:1 on every light and dark background of the theme', () => {
    for (const [palette, tokens] of [
      [paletteOf(light), themes.light],
      [paletteOf(dark), themes.dark],
    ] as const) {
      for (const color of palette.values()) {
        for (const background of BACKGROUNDS) {
          expect(contrast(color, tokens.get(background) ?? '')).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });
});
