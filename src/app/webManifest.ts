/**
 * The web app manifest, built at compile time by vite.config.ts (vite-plugin-pwa).
 * Kept here, free of imports, so that the build and the unit tests share it.
 */

/** The colours of the installed app, taken from the light theme tokens (src/ui/theme.css). */
export interface ManifestColors {
  /** Title bar and task switcher: the jade accent of the logo. */
  themeColor: string;
  /** Splash screen while the app starts: the paper background. */
  backgroundColor: string;
}

/** The light tokens of theme.css, as read by `themeTokens` (src/ui/contrast.ts). */
export function manifestColors(lightTokens: ReadonlyMap<string, string>): ManifestColors {
  const token = (name: string) => {
    const value = lightTokens.get(name);
    if (value === undefined) {
      throw new Error(`Theme token --${name} not found in theme.css`);
    }
    return value;
  };
  return { themeColor: token('jade'), backgroundColor: token('bg') };
}

/** The icons generated from the 词 logo (e2e/icons.spec.ts), in public/icons/. */
export const MANIFEST_ICONS = [
  { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
  { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
  { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
] as const;

/** The manifest of the app served under `base` (e.g. /vocab-learner/ on GitHub Pages). */
export function webManifest(base: string, { themeColor, backgroundColor }: ManifestColors) {
  return {
    id: base,
    name: 'vocab-learner : vocabulaire chinois et anglais',
    short_name: 'vocab-learner',
    description:
      'Maîtrise le vocabulaire de ta leçon, en chinois et en anglais. Sans compte, hors ligne.',
    lang: 'fr',
    dir: 'ltr' as const,
    start_url: base,
    scope: base,
    display: 'standalone' as const,
    orientation: 'any' as const,
    theme_color: themeColor,
    background_color: backgroundColor,
    categories: ['education'],
    icons: MANIFEST_ICONS.map((icon) => ({ ...icon })),
  };
}
