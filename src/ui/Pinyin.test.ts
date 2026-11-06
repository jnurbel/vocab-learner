/// <reference types="node" />
// Node types are needed here only, to read the stylesheet from disk.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import Pinyin from './Pinyin.svelte';

// Read from disk: Vitest does not process CSS, so a `?raw` import would be empty.
const tonesCss = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'tones.css'), 'utf8');

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

/** WCAG relative luminance and contrast ratio of two #rrggbb colours. */
function contrast(first: string, second: string): number {
  const luminance = (hex: string) => {
    const [red, green, blue] = [1, 3, 5].map((start) => {
      const channel = Number.parseInt(hex.slice(start, start + 2), 16) / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * (red ?? 0) + 0.7152 * (green ?? 0) + 0.0722 * (blue ?? 0);
  };
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);
}

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

  it('reaches the WCAG AA contrast of 4.5:1 on the light and the dark background', () => {
    for (const color of paletteOf(light).values()) {
      expect(contrast(color, '#ffffff')).toBeGreaterThanOrEqual(4.5);
    }
    for (const color of paletteOf(dark).values()) {
      expect(contrast(color, '#121212')).toBeGreaterThanOrEqual(4.5);
    }
  });
});
