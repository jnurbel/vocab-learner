import { expect, test } from '@playwright/test';

test('a learner enters one word with the keyboard, then enters it again to add a label', async ({
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
  const form = page.getByRole('form', { name: 'Ajouter un mot' });
  const term = form.getByLabel('Mot (hanzi ou anglais)');

  await term.fill('长城');
  await expect(form.getByLabel('Pinyin')).toHaveValue('cháng chéng');

  // The proposal is editable: retype it with tone numbers, then validate with Enter.
  await term.focus();
  await page.keyboard.press('Tab');
  await expect(form.getByLabel('Pinyin')).toBeFocused();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('Chang2cheng2');
  await page.keyboard.press('Tab');
  await page.keyboard.type('la Grande Muraille');
  await page.keyboard.press('Enter');

  await expect(form.getByRole('status')).toHaveText('« 长城 » ajouté.');
  await expect(term).toBeFocused();
  const list = page.getByRole('table', { name: 'Liste des mots' });
  await expect(list.getByRole('row', { name: /长城/ })).toContainText('Cháng');

  await term.fill('长城');
  await form.getByLabel('Sens').fill('la Grande Muraille');
  await form.getByLabel('Nouveau label ou label existant (facultatif)').fill('Monuments');
  await form.getByRole('button', { name: 'Ajouter le mot' }).click();

  await expect(form.getByRole('status')).toHaveText('« 长城 » existait déjà : labels ajoutés.');
  await expect(list.getByRole('row', { name: /长城/ })).toHaveCount(1);
  await expect(list.getByRole('row', { name: /长城/ })).toContainText('Monuments');
  expect(errors).toEqual([]);
});
