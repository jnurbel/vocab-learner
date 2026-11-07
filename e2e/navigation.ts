import type { Page } from '@playwright/test';

/** The app opens on the home screen: the word entry is one menu click away. */
export async function openWords(page: Page): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Menu' })
    .getByRole('button', { name: 'Mes mots' })
    .click();
}
