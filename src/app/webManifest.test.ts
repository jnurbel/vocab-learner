/// <reference types="node" />
// Node types are needed here only, to read the stylesheet and the icons from disk.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { themeTokens } from '../ui/contrast';
import { MANIFEST_ICONS, manifestColors, webManifest } from './webManifest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const { light } = themeTokens(readFileSync(join(root, 'src', 'ui', 'theme.css'), 'utf8'));

describe('manifestColors', () => {
  it('takes the jade accent and the paper background of the light theme', () => {
    expect(manifestColors(light)).toEqual({
      themeColor: light.get('jade'),
      backgroundColor: light.get('bg'),
    });
  });

  it('refuses a theme without the tokens, rather than a manifest without colours', () => {
    expect(() => manifestColors(new Map())).toThrow('--jade');
  });
});

describe('webManifest', () => {
  const manifest = webManifest('/vocab-learner/', manifestColors(light));

  it('opens the app installed, in its own window, under its base path', () => {
    expect(manifest).toMatchObject({
      start_url: '/vocab-learner/',
      scope: '/vocab-learner/',
      display: 'standalone',
      lang: 'fr',
      short_name: 'vocab-learner',
    });
  });

  it('offers the 192 and 512 icons, and a maskable one for Android', () => {
    expect(manifest.icons.map(({ sizes, purpose }) => `${sizes} ${purpose}`)).toEqual([
      '192x192 any',
      '512x512 any',
      '512x512 maskable',
    ]);
  });

  it('gives the page the same theme colour as the manifest', () => {
    const html = readFileSync(join(root, 'index.html'), 'utf8');

    expect(html).toContain(`<meta name="theme-color" content="${manifest.theme_color}" />`);
  });

  it('points at icons that exist in public/', () => {
    for (const { src } of MANIFEST_ICONS) {
      expect(existsSync(join(root, 'public', src)), src).toBe(true);
    }
  });
});
