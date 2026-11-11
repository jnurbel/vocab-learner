import { expect, test } from '@playwright/test';
import { openWords } from './navigation.ts';

test('a learner exports the filtered words as CSV and imports the file on a fresh device', async ({
  page,
  browser,
}) => {
  await page.goto('./');
  await openWords(page);
  await page
    .getByLabel('Un mot par ligne')
    .fill('猫 | māo | chat\n狗 || =chien\napple | pomme; "fruit"');
  const bulkEntry = page.getByRole('region', { name: 'Saisie en lot' });
  await bulkEntry.getByLabel('Nouveau label ou label existant (facultatif)').fill('Leçon 1');
  await page.getByRole('button', { name: 'Ajouter 3 mots' }).click();
  await expect(page.getByRole('table', { name: 'Liste des mots' }).getByRole('row')).toHaveCount(4);

  // Only the Chinese words are exported: the list is filtered first.
  await page.getByLabel('Langue').selectOption({ label: 'Chinois' });
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exporter ces mots en CSV' }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^vocab-learner-mots-\d{4}-\d{2}-\d{2}\.csv$/);
  const chunks: Buffer[] = [];
  for await (const chunk of await download.createReadStream()) {
    chunks.push(chunk as Buffer);
  }
  const bytes = Buffer.concat(chunks);
  // UTF-8 with BOM for Excel, and the formula neutralized.
  expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  const text = bytes.toString('utf8');
  expect(text).toContain("'=chien");
  expect(text).not.toContain('apple');

  // A fresh device: another browser context, with an empty database.
  const context = await browser.newContext();
  const fresh = await context.newPage();
  await fresh.goto('./');
  await openWords(fresh);
  await fresh.getByRole('tab', { name: 'Fichier CSV' }).click();
  await fresh.getByLabel('Choisir un fichier CSV').setInputFiles({
    name: 'mots.csv',
    mimeType: 'text/csv',
    buffer: bytes,
  });
  const preview = fresh.getByRole('table', { name: 'Aperçu du fichier' });
  await expect(preview.getByRole('row')).toHaveCount(3);
  await fresh.getByRole('button', { name: 'Importer le fichier' }).click();
  await expect(fresh.getByRole('region', { name: 'Fichier CSV' }).getByRole('status')).toHaveText(
    '2 mot(s) ajouté(s), 0 mot(s) existant(s) complété(s).',
  );

  const list = fresh.getByRole('table', { name: 'Liste des mots' });
  await expect(list.getByRole('row', { name: /狗/ })).toContainText('=chien');
  await expect(list.getByRole('row', { name: /狗/ })).toContainText('Leçon 1');
  await expect(list.getByRole('row', { name: /猫/ })).toContainText('chat');
  await context.close();
});
