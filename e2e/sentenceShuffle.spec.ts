import { expect, test } from '@playwright/test';
import { installFakeSpeech, openMiniGame } from './fakeSpeech.ts';
import { openWords } from './navigation.ts';

const SENTENCE = ['I', 'like', 'my', 'cat.'];

test('SentenceShuffle: the chunks of an example are put back in order', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => {
    errors.push(error.message);
  });
  await installFakeSpeech(page);
  await page.goto('./');
  await openWords(page);
  const form = page.getByRole('form', { name: 'Ajouter un mot' });
  await form.getByLabel('Mot (hanzi ou anglais)').fill('cat');
  await form.getByLabel('Sens').fill('chat');
  await form.getByLabel('Exemple (facultatif)').fill('I like my cat.');
  await form.getByRole('button', { name: 'Ajouter le mot' }).click();
  await expect(form.getByRole('status')).toHaveText('« cat » ajouté.');

  await openMiniGame(page, "Remettre la phrase dans l'ordre", 'Anglais');
  const game = page.getByRole('region', { name: "Mini-jeu : remettre la phrase dans l'ordre" });
  await game.getByRole('button', { name: 'Commencer' }).click();

  // The tiles are found by their text: their shuffled order is never assumed.
  const reserve = game.getByRole('group', { name: 'Morceaux à placer' });
  for (const chunk of SENTENCE) {
    await reserve.getByRole('button', { name: chunk, exact: true }).click();
  }
  await expect(game.getByRole('group', { name: 'Ta phrase' }).getByRole('button')).toHaveText(
    SENTENCE,
  );
  await game.getByRole('button', { name: 'Valider' }).click();

  await expect(game.getByRole('status')).toContainText('Juste.');
  await expect(game.getByRole('status')).toContainText('I like my cat.');
  await game.getByRole('button', { name: 'Continuer' }).click();
  await expect(game.getByRole('heading', { name: 'Phrases remises en ordre' })).toBeVisible();
  expect(errors).toEqual([]);
});
