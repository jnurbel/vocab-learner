import { expect, test, type Page } from '@playwright/test';
import { openWords } from './navigation.ts';
import { createProfile, switchProfile } from './profileMenu.ts';
import { simulateProgress } from './progressStore.ts';

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => {
    errors.push(error.message);
  });
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  return errors;
}

async function addWord(page: Page, line: string) {
  await openWords(page);
  const bulkEntry = page.getByRole('region', { name: 'Saisie en lot' });
  await bulkEntry.getByLabel('Un mot par ligne').fill(line);
  await bulkEntry.getByRole('button', { name: 'Ajouter 1 mot' }).click();
  await expect(bulkEntry.getByRole('status')).toHaveText('1 mot(s) ajouté(s).');
}

function wordList(page: Page) {
  return page.getByRole('table', { name: 'Liste des mots' });
}

async function openGarden(page: Page) {
  await page
    .getByRole('navigation', { name: 'Menu' })
    .getByRole('button', { name: 'Jardin' })
    .click();
  return page.getByRole('region', { name: 'Ton jardin de mots' });
}

test.describe('profiles', () => {
  test.use({ reducedMotion: 'reduce' });

  test('each profile has its own words and its own island', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('./');
    await expect(page.getByRole('button', { name: 'Profil : Moi' })).toBeVisible();
    await addWord(page, 'cat | chat');
    // The first profile keeps the database used before profiles existed.
    await simulateProgress(page, { xp: 1750, islandLevelSeen: 8 });

    await createProfile(page, 'Moi', 'Léa');
    await addWord(page, 'dog | chien');
    await expect(wordList(page).getByRole('row')).toHaveCount(2);
    await expect(wordList(page).getByRole('row', { name: /dog/ })).toBeVisible();
    let garden = await openGarden(page);
    await expect(garden.getByRole('img', { name: /^Île niveau 1/ })).toBeVisible();

    await switchProfile(page, 'Léa', 'Moi');
    await openWords(page);
    await expect(wordList(page).getByRole('row')).toHaveCount(2);
    await expect(wordList(page).getByRole('row', { name: /cat/ })).toBeVisible();
    await expect(wordList(page).getByRole('row', { name: /dog/ })).toHaveCount(0);
    garden = await openGarden(page);
    await expect(garden.getByRole('img', { name: /^Île niveau 8/ })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('the app reopens on the profile used last', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('./');
    await createProfile(page, 'Moi', 'Léa');
    await addWord(page, 'dog | chien');

    await page.reload();

    await expect(page.getByRole('button', { name: 'Profil : Léa' })).toBeVisible();
    await openWords(page);
    await expect(wordList(page).getByRole('row', { name: /dog/ })).toBeVisible();
    expect(errors).toEqual([]);
  });
});
