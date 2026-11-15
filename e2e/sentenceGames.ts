import { expect, type Page } from '@playwright/test';
import { openWords } from './navigation.ts';

/** Adds Chinese words through the word form; the pinyin is computed by the app. */
export async function addChineseWords(
  page: Page,
  words: readonly (readonly [string, string])[],
): Promise<void> {
  await openWords(page);
  const form = page.getByRole('form', { name: 'Ajouter un mot' });
  for (const [term, meaning] of words) {
    await form.getByLabel('Mot (hanzi ou anglais)').fill(term);
    await form.getByLabel('Sens').fill(meaning);
    await form.getByRole('button', { name: 'Ajouter le mot' }).click();
    await expect(form.getByRole('status')).toHaveText(`« ${term} » ajouté.`);
  }
}

/** Requests leaving the app's origin: the sentence games must make none (privacy). */
export function watchForeignRequests(page: Page, origin: string): string[] {
  const foreign: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol.startsWith('http') && url.origin !== origin) {
      foreign.push(request.url());
    }
  });
  return foreign;
}
