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

  const preview = page.getByRole('table', { name: 'Mots nouveaux' });
  await expect(preview).toContainText('nǐ hǎo');
  await expect(preview).toContainText('xièxie');
  await expect(page.getByRole('list', { name: 'Lignes à corriger' })).toContainText(
    'Ligne 4 : sens manquant',
  );

  // Keyboard only from here: tab to the label field, then to the save button.
  await page.getByLabel('Un mot par ligne').focus();
  await page.keyboard.press('Tab');
  await expect(
    page
      .getByRole('region', { name: 'Saisie en lot' })
      .getByLabel('Nouveau label ou label existant (facultatif)'),
  ).toBeFocused();
  await page.keyboard.type('Leçon 1');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Ajouter 3 mots' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toHaveText('3 mot(s) ajouté(s).');

  await page.reload();

  const list = page.getByRole('table', { name: 'Liste des mots' });
  await expect(list.getByRole('row', { name: /你好/ })).toContainText('Leçon 1');
  await page.getByLabel('Langue').selectOption({ label: 'Anglais' });
  await expect(list.getByRole('row')).toHaveCount(2);
  await expect(list.getByRole('row', { name: /apple/ })).toBeVisible();
  await page.getByLabel('Label', { exact: true }).selectOption({ label: 'Leçon 1' });
  await expect(list.getByRole('row', { name: /apple/ })).toBeVisible();

  expect(errors).toEqual([]);
});
