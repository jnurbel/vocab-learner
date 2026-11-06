import { expect, test } from '@playwright/test';

test('a learner pastes a lesson, labels it, saves it and finds it again after a reload', async ({
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
    .fill('你好 || bonjour\n谢谢 | xie4xie | merci\napple | pomme\npear');

  const bulkEntry = page.getByRole('region', { name: 'Saisie en lot' });
  await expect(bulkEntry.getByLabel('Pinyin, ligne 1')).toHaveValue('nǐ hǎo');
  await expect(bulkEntry.getByLabel('Pinyin, ligne 2')).toHaveValue('xièxie');
  await expect(page.getByRole('list', { name: 'Lignes à corriger' })).toContainText(
    'Ligne 4 : sens manquant',
  );

  // The preview is editable: correct a meaning, exclude a line, the plan follows.
  await bulkEntry.getByLabel('Sens, ligne 1').fill('bonjour !');
  await bulkEntry.getByRole('checkbox', { name: 'Exclure la ligne 2' }).check();
  await expect(bulkEntry.getByRole('row', { name: /谢谢/ })).toContainText('Exclu');

  // Keyboard only from here: the label field, then tab to the save button.
  const labelField = bulkEntry.getByLabel('Nouveau label ou label existant (facultatif)');
  await labelField.focus();
  await page.keyboard.type('Leçon 1');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Ajouter 2 mots' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(bulkEntry.getByRole('status')).toHaveText('2 mot(s) ajouté(s).');

  await page.reload();

  const list = page.getByRole('table', { name: 'Liste des mots' });
  await expect(list.getByRole('row', { name: /你好/ })).toContainText('Leçon 1');
  await expect(list.getByRole('row', { name: /你好/ })).toContainText('bonjour !');
  await expect(list.getByRole('row', { name: /谢谢/ })).toHaveCount(0);
  await page.getByLabel('Langue').selectOption({ label: 'Anglais' });
  await expect(list.getByRole('row')).toHaveCount(2);
  await expect(list.getByRole('row', { name: /apple/ })).toBeVisible();
  await page.getByLabel('Label', { exact: true }).selectOption({ label: 'Leçon 1' });
  await expect(list.getByRole('row', { name: /apple/ })).toBeVisible();

  expect(errors).toEqual([]);
});
