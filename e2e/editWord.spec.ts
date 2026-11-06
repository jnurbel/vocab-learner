import { expect, test } from '@playwright/test';

test('a learner fixes a word from the list, cannot turn it into a duplicate, and deletes another', async ({
  page,
}) => {
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
  await page
    .getByLabel('Un mot par ligne')
    .fill('猫 | mao1 | chat\n狗 | gou3 | chien\nbook | livre');
  await page.getByRole('button', { name: 'Ajouter 3 mots' }).click();
  const list = page.getByRole('table', { name: 'Liste des mots' });
  await expect(list.getByRole('row')).toHaveCount(4);

  await list.getByRole('button', { name: 'Modifier 猫' }).press('Enter');
  const editor = page.getByRole('form', { name: 'Modifier « 猫 »' });
  const term = editor.getByLabel('Mot (hanzi ou anglais)');
  await expect(term).toBeFocused();

  await term.fill('狗');
  await editor.getByRole('button', { name: 'Enregistrer les modifications' }).click();
  await expect(term).toHaveAccessibleDescription('Ce mot existe déjà dans ta liste.');

  await term.fill('小猫');
  await editor.getByLabel('Pinyin').fill('xiao3mao1');
  await editor.getByLabel('Sens').fill('chaton');
  await editor.getByLabel('Sens').press('Enter');
  await expect(editor).toBeHidden();
  await expect(list.getByRole('row', { name: /小猫/ })).toContainText('xiǎomāo');
  await expect(list.getByRole('row', { name: /小猫/ })).toContainText('chaton');

  // Deleting asks first; Cancel has the focus so that a hasty Enter keeps the word.
  await list.getByRole('button', { name: 'Supprimer book' }).press('Enter');
  await expect(page.getByRole('button', { name: 'Annuler' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(list.getByRole('row', { name: /book/ })).toBeVisible();

  await list.getByRole('button', { name: 'Supprimer book' }).press('Enter');
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'Confirmer la suppression' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status').filter({ hasText: '« book » supprimé.' })).toBeVisible();
  await expect(list.getByRole('row', { name: /book/ })).toHaveCount(0);

  await page.reload();
  await expect(list.getByRole('row')).toHaveCount(3);
  expect(errors).toEqual([]);
});
