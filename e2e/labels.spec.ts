import { expect, type Page, test } from '@playwright/test';

async function addWords(page: Page, lines: string, labelName: string, count: number) {
  const bulkEntry = page.getByRole('region', { name: 'Saisie en lot' });
  await bulkEntry.getByLabel('Un mot par ligne').fill(lines);
  await bulkEntry.getByLabel('Nouveau label ou label existant (facultatif)').fill(labelName);
  await bulkEntry.getByRole('button', { name: `Ajouter ${String(count)} mots` }).click();
  await expect(bulkEntry.getByRole('status')).toHaveText(`${String(count)} mot(s) ajouté(s).`);
}

test('a learner renames, merges and deletes labels, and never loses a word', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    errors.push(error.message);
  });

  await page.goto('./');
  await addWords(page, 'cat | chat\ndog | chien', 'Animaux', 2);
  await addWords(page, 'lion | lion\ntiger | tigre', 'Fauves', 2);
  const manager = page.getByRole('region', { name: 'Mes labels' });
  const labels = manager.getByRole('table', { name: 'Labels et nombre de mots' });
  await expect(labels.getByRole('row', { name: /Animaux/ })).toContainText('2 mot(s)');

  await manager.getByLabel('Nouveau nom pour Fauves').fill('Grands fauves');
  await manager.getByRole('button', { name: 'Renommer Fauves' }).click();
  await expect(labels.getByRole('rowheader', { name: 'Grands fauves' })).toBeVisible();

  await manager.getByLabel('Fusionner Grands fauves dans').selectOption({ label: 'Animaux' });
  await manager.getByRole('button', { name: 'Fusionner Grands fauves' }).click();
  await manager.getByRole('button', { name: 'Confirmer la fusion' }).click();
  await expect(labels.getByRole('row')).toHaveCount(2);
  await expect(labels.getByRole('row', { name: /Animaux/ })).toContainText('4 mot(s)');

  await manager.getByRole('button', { name: 'Supprimer le label Animaux' }).click();
  await manager.getByRole('button', { name: 'Confirmer la suppression du label' }).click();
  await expect(manager.getByText("Aucun label pour l'instant.")).toBeVisible();

  await page.reload();
  const list = page.getByRole('table', { name: 'Liste des mots' });
  await expect(list.getByRole('row')).toHaveCount(5);
  expect(errors).toEqual([]);
});
