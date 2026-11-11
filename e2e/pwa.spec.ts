import { expect, test, type Page } from '@playwright/test';
import { openWords } from './navigation.ts';
import { publishNextVersion, serviceWorkerReady, updateBanner } from './serviceWorker.ts';

/**
 * The installable, offline app, on the production build: the manifest, the service worker
 * and its precache, a reload without network, and the update that waits for a click.
 */

interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
}

/** Width and height of a PNG file, read from its IHDR chunk. */
function pngSize(png: Buffer): string {
  expect(png.subarray(1, 4).toString('latin1')).toBe('PNG');
  return `${String(png.readUInt32BE(16))}x${String(png.readUInt32BE(20))}`;
}

/** Console errors and uncaught exceptions, CSP violations included. */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    errors.push(error.message);
  });
  return errors;
}

async function addWords(page: Page, lines: string) {
  const bulk = page.getByRole('region', { name: 'Saisie en lot' });
  await bulk.getByLabel('Un mot par ligne').fill(lines);
  await expect(bulk.getByLabel('Pinyin, ligne 1')).not.toHaveValue('');
  await bulk.getByRole('button', { name: /^Ajouter/ }).click();
  await expect(bulk.getByRole('status')).toContainText('ajouté');
}

test('the web manifest is valid, with its icons, and linked from the page', async ({
  page,
  request,
}) => {
  await page.goto('./');

  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBe('/vocab-learner/manifest.webmanifest');
  const response = await request.get(href ?? '');
  expect(response.ok()).toBe(true);
  const manifest = (await response.json()) as {
    name: string;
    theme_color: string;
    background_color: string;
    icons: ManifestIcon[];
  };
  expect(manifest).toMatchObject({
    short_name: 'vocab-learner',
    start_url: '/vocab-learner/',
    scope: '/vocab-learner/',
    display: 'standalone',
    lang: 'fr',
  });
  expect(manifest.name).toEqual(expect.stringContaining('vocab-learner'));
  expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/);
  expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/);

  expect(manifest.icons.map(({ sizes, purpose }) => `${sizes} ${purpose ?? 'any'}`)).toEqual(
    expect.arrayContaining(['192x192 any', '512x512 any', '512x512 maskable']),
  );
  for (const icon of manifest.icons) {
    const file = await request.get(new URL(icon.src, response.url()).href);
    expect(file.ok(), icon.src).toBe(true);
    expect(file.headers()['content-type']).toBe(icon.type);
    expect(pngSize(await file.body()), icon.src).toBe(icon.sizes);
  }
});

test('the service worker registers, and the app reloads offline with its words and pinyin', async ({
  page,
  context,
}) => {
  const errors = collectErrors(page);
  await page.goto('./');
  await openWords(page);
  await addWords(page, '你好 || bonjour');

  const worker = await serviceWorkerReady(page);
  expect(worker.scope).toMatch(/\/vocab-learner\/$/);
  expect(worker.script).toMatch(/\/vocab-learner\/sw\.js$/);

  await context.setOffline(true);
  await page.reload();

  await expect(page.getByRole('banner').getByText('Hors ligne')).toBeVisible();
  await openWords(page);
  const list = page.getByRole('table', { name: 'Liste des mots' });
  await expect(list.getByRole('row', { name: /你好/ })).toBeVisible();
  // pinyin-pro is loaded on demand: from the precache, as there is no network.
  await page
    .getByRole('region', { name: 'Saisie en lot' })
    .getByLabel('Un mot par ligne')
    .fill('谢谢 || merci');
  await expect(page.getByLabel('Pinyin, ligne 1')).toHaveValue('xiè xiè');

  await context.setOffline(false);
  await expect(page.getByRole('banner').getByText('Hors ligne')).toBeHidden();
  expect(errors).toEqual([]);
});

test('a new version waits for "Mettre à jour", then takes over', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('./');
  await serviceWorkerReady(page);
  const banner = updateBanner(page);
  await expect(banner).toBeHidden();

  await publishNextVersion(page);

  await expect(banner).toContainText(/Tu utilises la version \d+\.\d+\.\d+\./);
  // The new version takes over, then the page reloads by itself, on this click only.
  await Promise.all([
    page.waitForEvent('load'),
    banner.getByRole('button', { name: 'Mettre à jour' }).click(),
  ]);
  await expect(banner).toBeHidden();
  expect(errors).toEqual([]);
});
