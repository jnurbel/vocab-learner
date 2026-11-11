import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { openWords } from './navigation.ts';

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

/** Empties the profile, as a browser cleanup or a new computer would. */
async function deleteDatabase(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const deletion = indexedDB.deleteDatabase('vocab-learner-default');
        deletion.onsuccess = () => {
          resolve();
        };
        deletion.onerror = () => {
          reject(new Error('Cannot delete the database'));
        };
      }),
  );
}

async function saveBackup(page: Page): Promise<{ name: string; text: string }> {
  await page
    .getByRole('navigation', { name: 'Menu' })
    .getByRole('button', { name: 'Sauvegarde' })
    .click();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Sauvegarder sur cet appareil' }).click();
  const download = await downloading;
  const path = await download.path();
  return { name: download.suggestedFilename(), text: await readFile(path, 'utf8') };
}

test('a learner backs up, loses the data, and finds the words and progress back', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto('./');
  await openWords(page);
  await page.getByLabel('Un mot par ligne').fill('猫 | mao1 | chat\napple | pomme');
  await page.getByRole('button', { name: 'Ajouter 2 mots' }).click();
  await expect(page.getByText(/Ta dernière sauvegarde date de plus de 7 jours/)).toBeVisible();

  const menu = page.getByRole('navigation', { name: 'Menu' });
  await menu.getByRole('button', { name: 'Flashcards' }).click();
  await page.getByRole('button', { name: 'Commencer' }).click();
  await page.getByRole('button', { name: 'Retourner' }).click();
  await page.getByRole('button', { name: 'Je savais' }).click();
  await expect(page.getByRole('heading', { name: 'Session terminée' })).toBeVisible();

  const backup = await saveBackup(page);
  // The words saved before profiles existed belong to the first profile, "Moi".
  expect(backup.name).toMatch(/^vocab-learner-Moi-\d{4}-\d{2}-\d{2}\.vocab-backup\.json$/);
  expect(JSON.parse(backup.text)).toMatchObject({ format: 'vocab-learner-backup' });
  await expect(page.getByRole('status')).toContainText('Sauvegarde téléchargée');

  await deleteDatabase(page);
  await page.reload();
  await openWords(page);
  await expect(page.getByText('Aucun mot pour ce filtre.')).toBeVisible();

  await menu.getByRole('button', { name: 'Sauvegarde' }).click();
  await page.getByLabel('Choisir un fichier de sauvegarde').setInputFiles({
    name: backup.name,
    mimeType: 'application/json',
    buffer: Buffer.from(backup.text),
  });
  const preview = page.getByRole('region', { name: 'Contenu de la sauvegarde' });
  await expect(preview).toContainText('2 mot(s) : 1 en chinois, 1 en anglais');
  await preview.getByRole('button', { name: 'Remplacer mes données' }).click();
  await page.getByRole('button', { name: 'Confirmer le remplacement' }).click();
  await expect(page.getByRole('status')).toContainText('Données remplacées');
  await expect(
    page.getByRole('button', { name: 'Télécharger mes anciennes données' }),
  ).toBeVisible();

  await menu.getByRole('button', { name: 'Mes mots' }).click();
  const list = page.getByRole('table', { name: 'Liste des mots' });
  await expect(list.getByRole('row')).toHaveCount(3);
  await expect(list.getByRole('row', { name: /猫/ })).toContainText('Pousse');

  // The progress came back too: the word answered today is not asked again.
  await menu.getByRole('button', { name: 'Flashcards' }).click();
  await page.getByRole('button', { name: 'Commencer' }).click();
  await expect(page.getByText("Rien n'a soif aujourd'hui.")).toBeVisible();
  expect(errors).toEqual([]);
});

test('a tampered or booby-trapped backup file is refused and changes nothing', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('./');
  await openWords(page);
  await page.getByLabel('Un mot par ligne').fill('book | livre');
  await page.getByRole('button', { name: 'Ajouter 1 mot' }).click();
  const backup = await saveBackup(page);
  const fileInput = page.getByLabel('Choisir un fichier de sauvegarde');

  // A word changed by hand: the fingerprint no longer matches.
  await fileInput.setInputFiles({
    name: 'tampered.json',
    mimeType: 'application/json',
    buffer: Buffer.from(backup.text.replace('livre', 'piège')),
  });
  await expect(page.getByRole('alert')).toContainText('son empreinte ne correspond plus');

  // A prototype pollution attempt.
  await fileInput.setInputFiles({
    name: 'trap.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      '{"format":"vocab-learner-backup","schemaVersion":1,"__proto__":{"polluted":true}}',
    ),
  });
  await expect(page.getByRole('alert')).toContainText('clé interdite (__proto__)');
  expect(await page.evaluate(() => 'polluted' in {})).toBe(false);
  await expect(page.getByRole('region', { name: 'Contenu de la sauvegarde' })).toHaveCount(0);

  await page
    .getByRole('navigation', { name: 'Menu' })
    .getByRole('button', { name: 'Mes mots' })
    .click();
  await expect(page.getByRole('table', { name: 'Liste des mots' }).getByRole('row')).toHaveCount(2);
  expect(errors).toEqual([]);
});
