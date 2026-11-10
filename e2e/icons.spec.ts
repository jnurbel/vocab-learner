import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { themeTokens } from '../src/ui/contrast.ts';

/**
 * Draws the icons of the installed app from the 词 logo of the menu (jade square, white
 * character), in the colours of src/ui/theme.css, and writes them to public/icons/.
 * Opt-in, as they rewrite files: UPDATE_ICONS=1 npx playwright test icons
 * The PNG files are committed: the build never draws them, so it stays reproducible.
 */
test.skip(!process.env.UPDATE_ICONS, 'Set UPDATE_ICONS=1 to redraw public/icons');

const { light } = themeTokens(readFileSync('src/ui/theme.css', 'utf8'));
const JADE = light.get('jade') ?? '';
const ON_JADE = light.get('on-jade') ?? '';

interface Icon {
  file: string;
  size: number;
  /** Corner radius of the jade square, as a share of the size; 0 fills the whole image. */
  radius: number;
  /** Height of the character, as a share of the size. */
  glyph: number;
}

const ICONS: readonly Icon[] = [
  // "any": the logo as in the menu, rounded, on a transparent background.
  { file: 'icon-192.png', size: 192, radius: 0.22, glyph: 0.62 },
  { file: 'icon-512.png', size: 512, radius: 0.22, glyph: 0.62 },
  // "maskable": Android cuts it to its own shape; the character stays in the 80 % safe circle.
  { file: 'icon-maskable-512.png', size: 512, radius: 0, glyph: 0.48 },
  // iOS rounds the corners of a full square by itself.
  { file: 'apple-touch-icon-180.png', size: 180, radius: 0, glyph: 0.58 },
];

for (const icon of ICONS) {
  test(`draws ${icon.file}`, async ({ page }) => {
    await page.setViewportSize({ width: icon.size, height: icon.size });
    await page.setContent(`<!doctype html>
      <html><body style="margin:0;background:transparent">
        <div id="logo" lang="zh-CN" style="
          width:${String(icon.size)}px;height:${String(icon.size)}px;
          display:flex;align-items:center;justify-content:center;
          background:${JADE};color:${ON_JADE};
          border-radius:${String(icon.radius * icon.size)}px;
          font-family:'Microsoft YaHei','PingFang SC','Noto Sans SC',sans-serif;
          font-weight:800;font-size:${String(icon.glyph * icon.size)}px;line-height:1">词</div>
      </body></html>`);
    const logo = page.locator('#logo');
    await expect(logo).toBeVisible();
    await logo.screenshot({ path: `public/icons/${icon.file}`, omitBackground: true });
  });
}
