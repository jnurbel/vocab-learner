import { readFile, writeFile } from 'node:fs/promises';
import { expect, type Locator, type Page } from '@playwright/test';

/** The service worker of the build served by `vite preview` (see playwright.config.ts). */
const SERVICE_WORKER = 'dist/sw.js';
/** What makes the next deployment differ from this build. */
const NEXT_VERSION = '\n// next version\n';

/** Waits until the service worker is active, i.e. the whole app is precached. */
export async function serviceWorkerReady(page: Page) {
  return page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    return { scope: registration.scope, script: registration.active?.scriptURL ?? '' };
  });
}

/** The banner that offers the new version. */
export function updateBanner(page: Page): Locator {
  return page.getByRole('complementary', { name: 'Nouvelle version disponible' });
}

/**
 * Simulates the next deployment, as the browser sees it: a service worker that differs by one
 * comment. `vite preview` serves dist/ from disk; the comment is removed as soon as the page
 * found the new version. Removing it, rather than writing back a copy, leaves the build intact
 * even when two runs overlap.
 */
export async function publishNextVersion(page: Page): Promise<void> {
  const built = (await readFile(SERVICE_WORKER, 'utf8')).replaceAll(NEXT_VERSION, '');
  try {
    await writeFile(SERVICE_WORKER, built + NEXT_VERSION);
    await page.reload();
    await expect(updateBanner(page)).toBeVisible();
  } finally {
    await writeFile(SERVICE_WORKER, built);
  }
}
